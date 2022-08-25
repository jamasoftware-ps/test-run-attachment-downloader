const fs = require("fs");
const archiver = require("archiver");
const log = require("electron-log");
const {next} = require("lodash/seq");

let reply; // This variable will store the callback function to reply to the front end.

// This object will store our response content for the front end.
// Response object structure:
// response.isCanceled set to True if error caused operation abort
// response.progress An object containing progress updates
// response.progress.value  A number between 0-100 denoting the percent of progress towards completion.
// response.progress.status A String stating the current operating status of the operation
// response.isComplete set to True when the operation has completed.
let majorIncrement = 0;
let minorIncrement = 0;

let response = {
    isCanceled: false,
    isComplete: false,
    progress: {
        value: 0,
        status: "started",
    },
};

// This object will keep track of the filenames that have been written to the zipArchiver.
let fileNames = {};

// config object structure:
// config.project: Object of project info
// config.sourceType: Either "Filter" or "Test Cycle"
// config.value: Object representing a Filter if sourceType is "Filter" or an Array of Test Cycle objects if source type is "Test Cycle"
// config.saveLocation: String denoting where the zip file generated should be saved.
// config.client: The configured JamaClient object ready and available for use.
// config.reply: A function that allows IPC communication with front end window for status updates.
function downloadAttachments(config) {
    // Configure zip archive for writing.
    reply = config.reply;
    let zipArchiver = setupArchiver(config.saveLocation);

    // reset Response object:
    response = {
        isCanceled: false,
        isComplete: false,
        progress: {
            value: 0,
            status: "started",
        },
    };

    // Reset the filenames object:
    fileNames = {};

    let workPromise;
    // Determine Source Type: Filter vs Test Cycle
    if (config.sourceType === "Filter") {
        workPromise = processFilter(
            config.project,
            config.value,
            config.client,
            config.includeTestCaseAttachments,
            zipArchiver
        );
    } else if (config.sourceType === "Test Cycle") {
        let testCyclesToProcess = config.value.slice();
        workPromise = processTestCycles(
            testCyclesToProcess,
            config.client,
            zipArchiver
        );
    } else {
        log.error("Invalid source type. Aborting.");
        throw new Error("Invalid source type");
    }
    workPromise
        .then(() => {
            response.isComplete = true;
            response.progress.value = 100;
        })
        .catch((err) => {
            log.error(err);
            response.isCanceled = true;
        })
        .then(() => {
            zipArchiver.finalize();
        });
}

//###############################################################################################################
//                          PROCESS TEST CYCLES
//###############################################################################################################

// Process an array of test cycles
function processTestCycles(testCycles, jamaClient, zipArchiver) {
    majorIncrement = Math.floor(100 / testCycles.length);
    let testCyclesProcessed = 0;
    return testCycles.reduce((accumulatorPromise, nextTestCycle) => {
        return accumulatorPromise.then(() => {
            response.progress.value = majorIncrement * testCyclesProcessed;
            testCyclesProcessed += 1;
            return processTestCycle(nextTestCycle, jamaClient, zipArchiver);
        });
    }, Promise.resolve());
}

// Process ONE test cycle.
// Do the following:
// 1: Pull all test runs for this test cycle
// 2: For each test run:
//    A: Check test run for attachments
// Download any attachments and save into zip file.
function processTestCycle(testCycle, jamaClient, zipArchiver) {
    log.info(`Processing test cycle: [${testCycle.id}] ${testCycle.fields.name}`);
    // Pull Test Plan for this test cycle
    let cycleInfo = [
        jamaClient.getSinglePage(`testplans/${testCycle.fields.testPlan}`),
        jamaClient.getAll(`testcycles/${testCycle.id}/testruns`),
    ];
    let testPlan;
    let testRuns;
    return Promise.all(cycleInfo)
        .then((values) => {
            // Extract values
            testPlan = values[0].data.data;
            testRuns = values[1].data;

            // Now check each test run for attachments.
            return Promise.all(
                testRuns.map((testRun) =>
                    jamaClient.getAll(`testruns/${testRun.id}/attachments`)
                )
            );
        })
        .then((values) => {
            let totalAttachmentCount = 0;
            values.forEach((value, index) => {
                testRuns[index].attachments = value.data;
                totalAttachmentCount += value.data.length;
            });
            minorIncrement = Math.floor(minorIncrement / totalAttachmentCount);
            if (minorIncrement < 1) minorIncrement = 1;
            return testRuns.reduce((accumulatorPromise, nextTestRun) => {
                return accumulatorPromise.then(() => {
                    return processTestRunAttachments(
                        nextTestRun,
                        testCycle,
                        testPlan,
                        jamaClient,
                        zipArchiver
                    );
                });
            }, Promise.resolve());
        });
}

//###############################################################################################################
//                          PROCESS FILTERS
//###############################################################################################################

// Process ONE filter.
function processFilter(project, filter, jamaClient, include, zipArchiver) {
    log.info(`Processing filter: [${filter.id}] ${filter.name}`);
    majorIncrement = 100;

    // If the project scope for this filter is CURRENT, then we must specify the desired project ID as a param
    let includeParams = new URLSearchParams();
    includeParams.append("include", "data.fields.testPlan");
    includeParams.append("include", "data.fields.testCycle");
    includeParams.append("include", "data.itemType");

    if (filter.projectScope === "CURRENT")
        includeParams.append("project", project.id);

    let items = [];
    let itemTypes;
    let itemType;
    let testPlans;
    let testCycles;

    // Fetch the filter results.
    return jamaClient
        .getAll(`filters/${filter.id}/results`, includeParams)
        .then((filterResults) => {
            // Ensure filter only contains testruns and testcases, remove other items from results.
            itemTypes = filterResults.linked.itemtypes;
            testPlans = filterResults.linked.testplans;
            testCycles = filterResults.linked.testcycles;
            filterResults.data.forEach((filterResult) => {
                // Check ItemType
                itemType = itemTypes[filterResult.itemType];
                if (itemType.typeKey === "TSTRN" || (include === true && itemType.typeKey === "TC")) {
                    // Append to list of items to fetch attachments for.
                    items.push(filterResult);
                } else {
                    log.error(
                        `Item [${filterResult.id}] is not a test run or test case. Item will not be processed.`
                    );
                }
            });

            // For each test run or test case returned, we must fetch the attachments
            return Promise.all(
                items.map((item) => {
                    itemType = itemTypes[item.itemType];
                    itemType = itemTypes[item.itemType];
                    if (itemType.typeKey === "TSTRN") {
                        return jamaClient.getAll(`testruns/${item.id}/attachments`);
                    }
                    else if (itemType.typeKey === "TC") {
                        return jamaClient.getAll(`items/${item.id}/attachments`);
                    }
                }));
        })
        .then((allItems) => {
            let totalAttachmentCount = 0;
            allItems.forEach((value, index) => {
                if (value) {
                    items[index].attachments = value.data;
                    totalAttachmentCount += value.data.length;
                }
            });
            minorIncrement = Math.floor(majorIncrement / totalAttachmentCount);
            if (minorIncrement < 1) minorIncrement = 1;
            return items.reduce((accumulatorPromise, nextItem) => {
                return accumulatorPromise.then(() => {
                    itemType = itemTypes[nextItem.itemType];
                    return itemType.typeKey === "TSTRN" ?
                        processTestRunAttachments(
                            nextItem,
                            testCycles[nextItem.fields.testCycle],
                            testPlans[nextItem.fields.testPlan],
                            jamaClient,
                            zipArchiver) :
                        processItemAttachments(
                            nextItem,
                            jamaClient,
                            zipArchiver
                        );
                });
            }, Promise.resolve());
        })
        .catch(error => {
            console.log("Error:", error);
            log.error("Error:", error);
        });
}

//###############################################################################################################
//                          UTILITY FUNCTIONS
//###############################################################################################################

// Processes a list of attachments for a Single testRun
function processTestRunAttachments(
    testRun,
    testCycle,
    testPlan,
    jamaClient,
    zipArchiver
) {
    log.info("Processing Test Run: ", testRun.id);

    let folderPath = `${testPlan.documentKey}/${testCycle.documentKey}/${testRun.documentKey}/`;
    // Process each attachment for this test run one at a time to avoid API overload.
    let testRunAttachments = testRun.attachments;
    if (testRunAttachments === undefined) return Promise.resolve([]);
    return testRunAttachments.reduce((accumulatorPromise, nextAttachment) => {
        return accumulatorPromise.then(() => {
            return downloadAttachment(
                nextAttachment,
                folderPath,
                jamaClient,
                zipArchiver
            );
        });
    }, Promise.resolve([]));
}


// Processes a list of attachments for a Single Item
function processItemAttachments(
    item,
    jamaClient,
    zipArchiver
) {
    let folderPath = `${item.documentKey}/`;
    let itemAttachments = item.attachments;
    // Process each attachment for this item one at a time to avoid API overload.
    if (itemAttachments === undefined) return Promise.resolve([]);
    return itemAttachments.reduce((accumulatorPromise, nextAttachment) => {
        return accumulatorPromise.then(() => {
            return downloadAttachment(
                nextAttachment,
                folderPath,
                jamaClient,
                zipArchiver
            );
        });
    }, Promise.resolve([]));
}

// Download attachment file to zip archive.
function downloadAttachment(attachment, folderPath, jamaClient, zipArchiver) {
    // return new Promise((resolve, reject) => {
    // Get stream from jamaclient
    return jamaClient.getFileStream(attachment.id).then(async (stream) => {
        log.info("Downloading attachment: ", attachment.id);
        let savePath = validateFileName(folderPath, attachment.fileName);

        // Write to archiver
        zipArchiver.append(stream.data, {name: savePath});

        // remove this await promise to allow multiple streams to be downloaded at once.
        // Note: that allowing multiple streams to be started may cause issues, as only one stream may be consumed by the
        // archiver at a time.
        await new Promise((fulfill) => {
            stream.data.on("end", fulfill);
        });
        log.debug("Download complete.");
        response.progress.value += minorIncrement;
        sendProgressUpdate();
    });
}

// This function will check to ensure no filenames are duplicated, and if they are it will append a (1), (2) ... ect to the end of the name to make it unique.
function validateFileName(folder, fileName) {
    let savePath = `${folder}${fileName}`;
    // Check if file already exists in archive
    if (savePath in fileNames) {
        // Get the dupe number and increment the store.
        let dupeNumber = fileNames[savePath] + 1;
        fileNames[savePath] = dupeNumber;

        // Split attachment filename on file '.' to isoloate file extension and add duplicate counter before file extension.
        let newFileName = "";
        let filenameParts = fileName.split(".");

        if (filenameParts.length === 1) {
            // This filename contains no '.' just add the dupe count to the end.
            newFileName = `${fileName} (${dupeNumber})`;
        } else {
            // Filename contains at least one '.'  append dupe number before the last entry
            for (let i = 0; i < filenameParts.length - 1; i++) {
                if (i !== 0) {
                    newFileName += ".";
                }
                newFileName += filenameParts[i];
            }
            newFileName += ` ${dupeNumber}.${
                filenameParts[filenameParts.length - 1]
            }`;
        }

        savePath = `${folder}${newFileName}`;
    } else {
        // No file exists with this name, enter into store.
        fileNames[savePath] = 0;
    }

    return savePath;
}

// Call this function to update the user / front end with the status of this module.
function sendProgressUpdate() {
    reply("jama-api-download-attachments-response", response);
}

// Initialize archive utility
function setupArchiver(outputFilePath) {
    // create a file to stream archive data to.
    const output = fs.createWriteStream(outputFilePath);
    const archive = archiver("zip", {
        zlib: {level: 9}, // Sets the compression level.
    });

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on("close", function () {
        log.info(archive.pointer() + " total bytes");
        log.info(
            "archiver has been finalized and the output file descriptor has closed."
        );
        sendProgressUpdate();
    });

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    output.on("end", function () {
        log.info("Data has been drained");
    });

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on("warning", function (err) {
        if (err.code === "ENOENT") {
            // log warning
            log.error(err);
        } else {
            // throw error
            log.error(err);
            throw err;
        }
    });

    // good practice to catch this error explicitly
    archive.on("error", function (err) {
        log.error(err);
        throw err;
    });

    // pipe archive data to the file
    archive.pipe(output);

    return archive;
}

exports.downloadAttachments = downloadAttachments;
