import * as React from "react";
import { withRouter } from "react-router-dom";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Grid from "@material-ui/core/Grid";
import AlertDialog from "./AlertDialog";
import { CircularProgress } from "@material-ui/core";
const ipc = window.require("electron").ipcRenderer;

const LOGIN_META_STORAGE_KEY = "login-meta";

class LoginForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      // state variables for each UI element on the form
      url: "",
      isBasic: props.basic,
      username: "", // or client ID
      password: "", // or client Secret
      rememberUser: false,

      // dialog error state
      showLoginError: false,
      errorTitle: "",
      errorMessage: "",

      // Used when checking credentials for validity
      checkingCredentials: false,
    };
    this.handleChange = this.handleChange.bind(this);
    this.login = this.login.bind(this);
  }

  componentDidMount() {
    // Register event handler for login IPC response
    ipc.on("jama-api-login-response", (event, message) => {
      this.handleLoginResponse(message);
    });

    let instance = JSON.parse(localStorage.getItem(LOGIN_META_STORAGE_KEY));
    if (instance != null) {
      if (instance.isBasic !== this.state.isBasic) return; // Why return on Oauth?
      this.setState({ url: instance.url });
      this.setState({ rememberUser: instance.rememberUser });

      // only set this is the user flagged 'remember'
      if (instance.rememberUser) {
        this.setState({ username: instance.username });
      }

      this.passwordInput.focus();
    } else {
      // no data found this is a fresh run
    }
  }

  _handleKeyDown = (e) => {
    if (e.key === "Enter") {
      this.login(e);
    }
  };

  showAlertDialog = (title, message) => {
    this.setState({
      showLoginError: true,
      errorTitle: title,
      errorMessage: message,
    });
  };
  closeAlertDialog = () => {
    this.setState({ showLoginError: false });
  };

  handleChange(event) {
    if (event.target.type === "checkbox")
      this.setState({ [event.target.name]: event.target.checked });
    else this.setState({ [event.target.name]: event.target.value });
  }

  handleLoginResponse(response) {
    this.setState({ checkingCredentials: false });
    if (response.isValid) {
      this.props.callback(response);

      // Save state for next login.
      let usernameSaved = this.state.rememberUser ? this.state.username : null;
      localStorage.setItem(
        LOGIN_META_STORAGE_KEY,
        JSON.stringify({
          url: this.state.url,
          username: usernameSaved,
          isBasic: this.state.isBasic,
          rememberUser: this.state.rememberUser,
        })
      );

      // Log saved data
      console.log("data", {
        url: this.state.url,
        username: usernameSaved,
        isBasic: this.state.isBasic,
        rememberUser: this.state.rememberUser,
      });

      // go to dashboard
      this.props.history.push("/");
    } else {
      console.log(response.message);

      // unauthorized
      let message = "Please ensure instance URL, ";
      message += this.props.basic
        ? "username, and password "
        : "Client ID, and Client Secret ";
      message += "are correct.";
      this.showAlertDialog("Unable to Login", message);
    }
  }

  login(e) {
    e.preventDefault();
    // Disable login button and start spinner
    this.setState({ checkingCredentials: true });

    // make a request to check the credentials.
    let login_creds = {
      url: this.state.url,
      isBasic: this.state.isBasic,
      username: this.state.username,
      password: this.state.password,
    };
    ipc.send("jama-api-login", login_creds);
  }

  render() {
    return (
      <div>
        <form onKeyDown={this._handleKeyDown}>
          <Grid container>
            <Grid item xs={12}>
              <TextField
                name="url"
                onChange={this.handleChange}
                value={this.state.url}
                label="Jama Instance URL"
                variant="outlined"
                size="small"
                margin="normal"
                autoFocus
                fullWidth
              />
            </Grid>
          </Grid>
          <Grid
            container
            direction="row"
            justify="space-between"
            alignItems="center"
          >
            <Grid item xs={8}>
              <TextField
                name="username"
                onChange={this.handleChange}
                value={this.state.username}
                label={this.state.isBasic ? "Username" : "Client ID"}
                variant="outlined"
                size="small"
                margin="normal"
                fullWidth
              />
            </Grid>
            <Grid item xs={4}>
              <FormControlLabel
                control={
                  <Checkbox
                    onChange={this.handleChange}
                    value={this.state.rememberUser}
                    checked={this.state.rememberUser}
                    name="rememberUser"
                    color="primary"
                  />
                }
                label="remember"
              />
            </Grid>
          </Grid>
          <Grid container>
            <Grid item xs={12}>
              <TextField
                name="password"
                type="password"
                onChange={this.handleChange}
                value={this.state.password}
                label={this.state.isBasic ? "Password" : "Client Secret"}
                variant="outlined"
                size="small"
                margin="normal"
                inputRef={(input) => {
                  this.passwordInput = input;
                }}
                fullWidth
              />
            </Grid>
          </Grid>
          <Grid
            container
            direction="row"
            justify="flex-end"
            alignItems="flex-end"
          >
            <Button
              disabled={this.state.checkingCredentials}
              color="primary"
              variant="contained"
              onClick={this.login}
            >
              {this.state.checkingCredentials ? (
                <CircularProgress size={24} />
              ) : (
                "login"
              )}
            </Button>
          </Grid>
        </form>
        <AlertDialog
          callback={this.closeAlertDialog}
          open={this.state.showLoginError}
          title={this.state.errorTitle}
          message={this.state.errorMessage}
        />
      </div>
    );
  }
}

export default withRouter(LoginForm);
