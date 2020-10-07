import React from "react";
import { Switch, Route, withRouter } from "react-router-dom";
import "./App.css";
import { createMuiTheme } from "@material-ui/core/styles";
import LoginPanel from "./pages/LoginPanel";
import { ThemeProvider } from "@material-ui/styles";
import Container from "@material-ui/core/Container";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import { AppBar, Button, Toolbar, Typography, Grid } from "@material-ui/core";

const ipc = window.require("electron").ipcRenderer;

const theme = createMuiTheme({
  palette: {
    primary: {
      light: "#de7355",
      main: "#d6502b",
      dark: "#95381e",
      contrastText: "#fff",
    },
    secondary: {
      light: "#565569",
      main: "#2c2b44",
      dark: "#1e1e2f",
      contrastText: "#FFF",
    },
  },
});

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      validCredentials: false,
      user: {},
    };

    this.loginUser = this.loginUser.bind(this);
    this.logoutUser = this.logoutUser.bind(this);
  }

  loginUser = (user) => {
    this.setState({ validCredentials: true, user: user.data.data });
  };

  logoutUser = () => {
    this.setState({ validCredentials: false });
    ipc.send("jama-api-logout", "");
    this.props.history.push("/");
  };

  render() {
    return (
      <div className="App">
        <ThemeProvider theme={theme}>
          <div className="appBarRoot">
            <AppBar position="static">
              <Toolbar>
                <Grid
                  container
                  direction="row"
                  justify="space-between"
                  alignItems="center"
                  spacing={3}
                >
                  <Grid item>
                    <Typography variant="h6">
                      {this.state.validCredentials === true
                        ? "Select Options"
                        : "Login"}
                    </Typography>
                  </Grid>
                  <Grid item>
                    <Typography variant="h6">
                      {this.state.validCredentials &&
                        `${this.state.user.firstName} ${this.state.user.lastName} `}
                      {this.state.validCredentials && (
                        <Button
                          variant="outlined"
                          color="inherit"
                          onClick={this.logoutUser}
                        >
                          Logout
                        </Button>
                      )}
                    </Typography>
                  </Grid>
                </Grid>
              </Toolbar>
            </AppBar>
          </div>
          <Container maxWidth="lg">
            <Switch>
              <Route path="/login">
                <LoginPanel loginUser={this.loginUser} />
              </Route>
              <Route path="/dashboard">
                <Dashboard credentials={this.state.credentials} />
              </Route>
              <Route path="/">
                <Home isLoggedIn={this.state.validCredentials}></Home>
              </Route>
            </Switch>
          </Container>
        </ThemeProvider>
      </div>
    );
  }
}

export default withRouter(App);
