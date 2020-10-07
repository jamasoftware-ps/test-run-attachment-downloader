import React from "react";
import PropTypes from "prop-types";
import AppBar from "@material-ui/core/AppBar";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Box from "@material-ui/core/Box";
import Card from "@material-ui/core/Card";
import Container from "@material-ui/core/Container";
import LoginForm from "../components/LoginForm";

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={2}>
          <div>{children}</div>
        </Box>
      )}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired,
};

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}

export default class AuthTabs extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      listDataFromChild: null,
      value: 0,
    };
    this.handleChange = this.handleChange.bind(this);
    this.handleCallback = this.handleCallback.bind(this);
  }

  handleChange(event, value) {
    this.setState({ value: value });
  }
  handleCallback(user) {
    this.props.loginUser(user);
  }
  render() {
    return (
      <Container id="loginContainer" maxWidth="sm">
        <Card>
          <AppBar color="secondary" position="static">
            <Tabs
              value={this.state.value}
              onChange={this.handleChange}
              aria-label="select authentication type"
              centered
            >
              <Tab label="Basic Auth" {...a11yProps(0)} />
              <Tab label="oAuth" {...a11yProps(1)} />
            </Tabs>
          </AppBar>
          <TabPanel value={this.state.value} index={0}>
            <LoginForm callback={this.handleCallback} basic={true} />
          </TabPanel>
          <TabPanel value={this.state.value} index={1}>
            <LoginForm callback={this.handleCallback} basic={false} />
          </TabPanel>
        </Card>
      </Container>
    );
  }
}
