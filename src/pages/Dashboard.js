import * as React from "react";
import { withRouter } from "react-router-dom";
import {
  Grid,
  TextField,
  Card,
  Radio,
  RadioGroup,
  FormControl,
  FormControlLabel,
  FormLabel,
  Container,
  withStyles,
  Button,
  LinearProgress,
  Checkbox
} from "@material-ui/core";
import { Autocomplete, Skeleton } from "@material-ui/lab";

const log = window.require("electron-log");
const { remote, ipcRenderer: ipc } = window.require("electron");
const dialog = remote.dialog;
const WIN = remote.getCurrentWindow();
const styles = {
  root: {
    "padding-top": "10px",
    "background-color": "#F7F7F7",
  },
};

class Dashboard extends React.Component {
  constructor(props) {
    super(props);

    // Allow user to choose a place to save the output of this utility.
    this.fileInput = React.createRef();

    // Initialize state Object
    this.state = {
      projects: [],
      projectsLoaded: false,
      project: {},
      projectSelected: false,
      sourceValue: "Filter",
      filters: [],
      filtersLoaded: false,
      includeTestCaseAttachments: false,
      filter: {},
      filterSelected: false,
      testCycles: [],
      testCyclesLoaded: false,
      selectedTestCycles: [],
      testCycleSelected: false,
      saveLocation: "",
      processing: false,
      progressVariant: "indeterminate",
      progressValue: "0",
    };

    // Bind event handlers
    this.handleSelectProject = this.handleSelectProject.bind(this);
    this.handleGetProjectsResponse = this.handleGetProjectsResponse.bind(this);
    this.handleSelectFilter = this.handleSelectFilter.bind(this);
    this.handleGetFiltersResponse = this.hanldeGetFiltersResponse.bind(this);
    this.handleSourceChange = this.handleSourceChange.bind(this);
    this.handleSelectTestCycle = this.handleSelectTestCycle.bind(this);
    this.handleGetTestCyclesResponse = this.handleGetTestCyclesResponse.bind(
      this
    );
    this.selectSaveLocation = this.selectSaveLocation.bind(this);
    this.saveDialogCallback = this.saveDialogCallback.bind(this);
    this.beginProcessing = this.beginProcessing.bind(this);
    this.handleDownloadAttachmentsResponse = this.handleDownloadAttachmentsResponse.bind(
      this
    );
    this.clearProgressTimeout = this.clearProgressTimeout.bind(this);
    this.setProgressIndeterminate = this.setProgressIndeterminate.bind(this);
    this.handleIncludeTestCaseAttachments = this.handleIncludeTestCaseAttachments.bind(this);
  }

  // Runs when componenet is loaded to screen
  componentDidMount() {
    // Register event handler for login IPC response
    ipc.on("jama-api-get-projects-response", this.handleGetProjectsResponse);

    // Register event handler for fetch filters for project
    ipc.on("jama-api-get-filters-response", this.handleGetFiltersResponse);

    // Register event handler for fetch test cycles for project
    ipc.on(
      "jama-api-get-test-cycles-response",
      this.handleGetTestCyclesResponse
    );

    ipc.on(
      "jama-api-download-attachments-response",
      this.handleDownloadAttachmentsResponse
    );

    // Begin fetch of projects from API
    ipc.send("jama-api-get-projects", "");
  }

  // Runs before component is unloaded from screen
  componentWillUnmount() {
    // Unregister event handlers (Not sure this is strictly requried. But it shouldn't hurt and will reduce unecissary processing.)
    ipc.removeListener(
      "jama-api-get-projects-response",
      this.handleGetProjectsResponse
    );
    ipc.removeListener(
      "jama-api-get-filters-response",
      this.handleGetFiltersResponse
    );
    ipc.removeListener(
      "jama-api-get-test-cycles-response",
      this.handleGetTestCyclesResponse
    );
    ipc.removeListener(
      "jama-api-download-attachments-response",
      this.handleDownloadAttachmentsResponse
    );
  }

  //###############################################################################################################
  //                          IPC Response handlers
  //###############################################################################################################

  // Deal with response from jama rest api get projects call.
  handleGetProjectsResponse(event, response) {
    log.info("Project fetch response: ", response);
    if (Array.isArray(response))
      this.setState({
        projects: response.filter((project) => project.isFolder === false),
        projectsLoaded: true,
      });
    else console.log("Failed to fetch projects.  ", response.message);
    // TODO POPUP ERROR FAILED TO FETCH
  }

  // Deal with response from jama rest api get filters call.
  hanldeGetFiltersResponse(event, response) {
    log.info("Filter fetch response: ", response);
    if (Array.isArray(response))
      this.setState({
        filters: response.filter((filter) => filter.projectScope !== "ALL"),
        filtersLoaded: true,
      });
    else log.error("Failed to fetch filters.  ", response.message);
    // TODO POPUP ERROR FAILED TO FETCH
  }

  // Deal with response from jama rest api get Test Cycles call.
  handleGetTestCyclesResponse(event, response) {
    log.info("Test cycle fetch response: ", response);
    if (Array.isArray(response))
      this.setState({ testCycles: response, testCyclesLoaded: true });
    else log.error("Failed to fetch test cycles.  ", response.message);
    // TODO POPUP ERROR FAILED TO FETCH
  }

  // Called with progress updates from main thread processing attachment downloads.
  handleDownloadAttachmentsResponse(event, response) {
    // Response object structure:
    // response.isCanceled set to True if error caused operation abort
    // response.progress An object containing progress updates
    // response.progress.value  A number between 0-100 dentoing the percent of progress towards completion.
    // response.progress.status A String stating the current operating status of the operation
    // response.isComplete set to True when the operation has completed.

    if (response.isCanceled) {
      //  TODO: Throw Error dialog to notify user.
      log.error("Attachment download failed.");
      // unlock UI
      this.setState({
        processing: false,
        progressVariant: "indeterminate",
        progressValue: 0,
      });
    } else if (response.isComplete) {
      // Execution complete.
      // Notify user
      dialog.showMessageBox(WIN, {
        type: "info",
        title: "Done",
        message: "Attachment export complete.",
      });
      // unlock UI
      this.setState({
        processing: false,
        progressVariant: "indeterminate",
        progressValue: 0,
      });
    } else if (response.progress) {
      this.clearProgressTimeout();
      let progressValue = 0;
      if (response.progress.value) progressValue = response.progress.value;
      if (progressValue < 0) progressValue = 0;
      if (progressValue > 100) progressValue = 100;
      let progressTimeout = setTimeout(this.setProgressIndeterminate, 5000);
      // This is a progress update. update progress bar with progress value.
      this.setState({
        progressVariant: "determinate",
        progressValue: progressValue,
        progressTimeout: progressTimeout,
      });
    }
  }

  clearProgressTimeout() {
    if (this.state.progressTimeout) {
      clearTimeout(this.state.progressTimeout);
      this.setState({ progressTimeout: undefined });
    }
  }

  setProgressIndeterminate() {
    this.setState({ progressVariant: "indeterminate" });
  }

  //###############################################################################################################
  //                          GUI action handlers
  //###############################################################################################################

  // Called when a new project is selected.
  handleSelectProject(event, newValue) {
    log.info("Project Selected: ", newValue);

    if (newValue !== null) {
      this.setState({
        project: newValue,
        projectSelected: true,
        filtersLoaded: false,
        testCyclesLoaded: false,
      });
      // Fetch Filters
      ipc.send("jama-api-get-filters", { projectId: newValue.id });

      // Fetch Test Cycles
      ipc.send("jama-api-get-test-cycles", { projectId: newValue.id });
    } else {
      this.setState({ project: {}, projectSelected: false });
    }
  }

  // Called when radio buttons change state
  handleSourceChange(event) {
    log.info("Source type change: " + event.target.value);
    this.setState({
      sourceValue: event.target.value,
      filter: {},
      filterSelected: false,
      testCycle: [],
      testCycleSelected: false,
    });
  }

  // Called when a filter is selected
  handleSelectFilter(event, newValue) {
    log.info("Filter selected: " + newValue);
    if (newValue !== null) {
      this.setState({ filter: newValue, filterSelected: true });
    } else {
      this.setState({ filter: {}, filterSelected: false });
    }
  }

  // Called when the Include Test case attachments checkbox changes state
  handleIncludeTestCaseAttachments(event) {
    log.info("Include Test Case checkbox change: " + event.target.checked);
    this.setState({includeTestCaseAttachments: event.target.checked});
  }

  // Called when a test cycle is selected
  handleSelectTestCycle(event, newValue) {
    log.info("Test cycle selected: ", newValue);
    if (newValue !== null) {
      this.setState({ selectedTestCycles: newValue, testCycleSelected: true });
    } else {
      this.setState({ selectedTestCycles: [], testCycleSelected: false });
    }
  }

  // Called when the select file location button is clicked.  Opens Electron dialog to choose
  selectSaveLocation() {
    let suggestedFilename =
      this.state.saveLocation === ""
        ? this.state.sourceValue === "Filter"
          ? this.state.filter.name
          : this.state.selectedTestCycles[0].fields.name
        : this.state.saveLocation;
    dialog
      .showSaveDialog(WIN, {
        title: "Save location",
        defaultPath: suggestedFilename,
        buttonLabel: "Select",
        filters: [{ name: "Archive", extensions: ["zip"] }],
        properties: ["createDirectory"],
      })
      .then((result) => this.saveDialogCallback(result))
      .catch((error) => log.error(error)); // Might want to open a error modal here and let the user know something failed.
  }

  // Called after the save file dialog returns.
  saveDialogCallback(result) {
    log.info(result);
    if (!result.canceled) {
      // Check file exists, confirm overwrite.
      //   fs.access(result.filePath, fs.F_OK, (error) => {
      //     console.log("File already exists.");
      //   });
      this.setState({ saveLocation: result.filePath });
    }
  }

  // Called when download attachments button is clicked.
  beginProcessing() {
    log.info("Starting downloads.");
    this.setState({ processing: true });
    ipc.send("jama-api-download-attachments", {
      project: this.state.project,
      sourceType: this.state.sourceValue,
      value:
        this.state.sourceValue === "Filter"
          ? this.state.filter
          : this.state.selectedTestCycles,
      includeTestCaseAttachments: this.state.includeTestCaseAttachments,
      saveLocation: this.state.saveLocation,
    });
  }

  render() {
    const { classes } = this.props;
    return (
      <Container>
        <Card className={classes.root} id="dashboard" color="primary">
          <Grid
            container
            direction="column"
            justify="space-around"
            alignItems="stretch"
            spacing={3}
          >
            <Grid item>
              {this.state.projectsLoaded ? (
                <Autocomplete
                  id="project-selector"
                  color="primary"
                  options={this.state.projects}
                  getOptionLabel={(option) => option.fields.name}
                  //   style={{ width: 300 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Project select"
                      variant="outlined"
                    />
                  )}
                  onChange={this.handleSelectProject}
                  disabled={this.state.processing}
                />
              ) : (
                <Skeleton variant="rect" width={300} height={55}></Skeleton>
              )}
            </Grid>
            <Grid item>
              <FormControl component="fieldset">
                <FormLabel component="legend">Source</FormLabel>
                <RadioGroup
                  row
                  aria-label="Source"
                  name="source1"
                  value={this.state.sourceValue}
                  onChange={this.handleSourceChange}
                >
                  <FormControlLabel
                    value="Filter"
                    control={<Radio />}
                    label="Filter"
                    disabled={this.state.processing}
                  />
                  <FormControlLabel
                    value="Test Cycle"
                    control={<Radio />}
                    label="Test Cycle"
                    disabled={this.state.processing}
                  />
                </RadioGroup>
                <FormControlLabel
                    value="Include Test Case Attachments"
                    control={<Checkbox />}
                    label="Include Test Case Attachments"
                    disabled={this.state.sourceValue === "Test Cycle"}
                    onChange={this.handleIncludeTestCaseAttachments}
                />
              </FormControl>
            </Grid>
            <Grid item>
              {this.state.projectSelected &&
                (this.state.sourceValue === "Filter" ? (
                  this.state.filtersLoaded ? (
                    <Autocomplete
                      id="filter-selector"
                      key="filterSelector"
                      options={this.state.filters}
                      getOptionLabel={(option) =>
                        `[${option.id}] ${option.name}`
                      }
                      //   style={{ width: 300 }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Filter select"
                          variant="outlined"
                        />
                      )}
                      onChange={this.handleSelectFilter}
                      disabled={this.state.processing}
                    />
                  ) : (
                    <Skeleton
                      variant="rect"
                      // width={300}
                      height={55}
                    ></Skeleton>
                  )
                ) : this.state.testCyclesLoaded ? (
                  <Autocomplete
                    multiple
                    id="test-cycle-selector"
                    key="testCycleSelector"
                    options={this.state.testCycles}
                    getOptionLabel={(option) =>
                      `[${option.id}] ${option.fields.name}`
                    }
                    // style={{ width: 300 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Test Cycle select"
                        variant="outlined"
                      />
                    )}
                    onChange={this.handleSelectTestCycle}
                    disabled={this.state.processing}
                  />
                ) : (
                  <Skeleton
                    variant="rect"
                    //   width={300}
                    height={55}
                  ></Skeleton>
                ))}
            </Grid>
            <Grid item>
              {(this.state.filterSelected || this.state.testCycleSelected) && (
                <Grid
                  container
                  direction="row"
                  justify="space-between"
                  alignItems="center"
                >
                  <Grid item xs={10}>
                    <TextField
                      // style={{ width: 300 }}
                      fullWidth
                      label="Output Location"
                      variant="outlined"
                      readOnly={true}
                      value={this.state.saveLocation}
                      onClick={
                        this.state.saveLocation !== ""
                          ? null
                          : this.selectSaveLocation
                      }
                      disabled={this.state.processing}
                    ></TextField>
                  </Grid>
                  <Grid item xs={2}>
                    <Button
                      style={{ height: "56px" }}
                      fullWidth
                      color="primary"
                      variant="contained"
                      onClick={this.selectSaveLocation}
                      disabled={this.state.processing}
                    >
                      Select
                    </Button>
                  </Grid>
                </Grid>
              )}
            </Grid>
            {this.state.saveLocation !== "" && (
              <Grid item>
                <Button
                  color="primary"
                  variant="contained"
                  onClick={this.beginProcessing}
                  disabled={this.state.processing}
                >
                  Download Attachments
                </Button>
              </Grid>
            )}
          </Grid>
          <Grid item>
            {this.state.processing && (
              <LinearProgress
                variant={this.state.progressVariant}
                value={this.state.progressValue}
                style={{ "margin-top": "10px" }}
              ></LinearProgress>
            )}
          </Grid>
        </Card>
      </Container>
    );
  }
}

export default withStyles(styles, { withTheme: true })(withRouter(Dashboard));
