const attachmentDownloader = require("./attachment-downloader");
const ipc = require("electron").ipcMain;
const { JamaClient } = require("./jama-client");
const log = require("electron-log");
let client;

// Logout user
ipc.on("jama-api-logout", (event, message) => {
  client = null;
});

// Listen for login request.
ipc.on("jama-api-login", (event, message) => {
  client = new JamaClient(
    message.url,
    message.username,
    message.password,
    message.isBasic ? "basic" : "oauth",
    {}
  );
  client
    .getSinglePage("users/current")
    .then((res) => {
      log.info("Login Success: ", res);
      res.isValid = true;
      event.reply("jama-api-login-response", res);
    })
    .catch((err) => {
      log.error("Login Failed: ", err.message);
      err.isValid = false;
      event.reply("jama-api-login-response", err);
    });
});

// Get projects
ipc.on("jama-api-get-projects", (event, message) => {
  client
    .getAll("projects")
    .then((res) => {
      event.reply("jama-api-get-projects-response", res.data);
    })
    .catch((err) => {
      log.error("project fetch failed", err);
      event.reply("jama-api-get-projects-response", err);
    });
});

// Get Filters for Project
ipc.on("jama-api-get-filters", (event, message) => {
  let projectID = message.projectId;
  client
    .getAll("filters", new URLSearchParams({ project: projectID }))
    .then((res) => {
      event.reply("jama-api-get-filters-response", res.data);
    })
    .catch((err) => {
      log.error("Filter fetch failed", err);
      event.reply("jama-api-get-filters-response", err);
    });
});

// Get Test Cycles
ipc.on("jama-api-get-test-cycles", (event, message) => {
  let projectID = message.projectId;

  // Fetch all testplans for the specified project.
  client
    .getAll("testplans", new URLSearchParams({ project: projectID }))
    .then((res) => {
      // Fetch all testcycles for each testplan.
      let testCyclesToReturn = [];
      let testCyclesToFetch = [];
      res.data.forEach((testPlan) => {
        let testCycleRequest = client.getAll(
          `testplans/${testPlan.id}/testcycles`
        );
        testCyclesToFetch.push(testCycleRequest);
      });
      Promise.all(testCyclesToFetch)
        .then((completedPromises) => {
          completedPromises.forEach((completedPromise) => {
            testCyclesToReturn = testCyclesToReturn.concat(
              completedPromise.data
            );
          });
          event.reply("jama-api-get-test-cycles-response", testCyclesToReturn);
        })
        .catch((err) => {
          // Error fetching test cycles
          log.error("Error fetching test cycles.  " + err);
          event.reply("jama-api-get-test-cycles-response", err);
        });
    })
    .catch((err) => {
      // Error fetching test plans
      localStorage.error("Error fetching test plans.  " + err.message);
      event.reply("jama-api-get-test-cycles-response", err);
    });
});

// This handler kicks off the main script / work logic for this application.
ipc.on("jama-api-download-attachments", (event, message) => {
  // Message object structure:
  // message.project: Object of project info
  // message.sourceType: Either "Filter" or "Test Cycle"
  // message.value: Object representing a Filter if sourceType is "Filter" or a Array of Test Cycle objects if source type is "Test Cycle"
  // message.saveLocation: String denoting where the zip file generated should be saved.

  // Response object structure:
  // response.isCanceled set to True if error caused operation abort
  // response.progress An object containing progress updates
  // response.progress.value  A number between 0-100 dentoing the percent of progress towards completion.
  // response.progress.status A String stating the current operating status of the operation
  // response.isComplete set to True when the operation has completed.

  const attachmentDownloaderConfig = {
    ...message,
    client: client,
    reply: event.reply,
  };

  attachmentDownloader.downloadAttachments(attachmentDownloaderConfig);
});
