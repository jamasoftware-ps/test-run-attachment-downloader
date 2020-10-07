import * as React from "react";
import { Redirect } from "react-router-dom";

class Home extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      credentials: props.data,
    };
  }

  render() {
    if (this.props.isLoggedIn === true) {
      return <Redirect to="/dashboard"></Redirect>;
    } else {
      return <Redirect to="/login"></Redirect>;
    }
  }
}

export default Home;
