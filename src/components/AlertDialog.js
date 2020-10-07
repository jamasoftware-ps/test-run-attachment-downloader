import React from 'react';
import DialogTitle from '@material-ui/core/DialogTitle';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";


class AlertDialog extends React.Component {

    constructor(props) {
        console.log('alertDialog constructor:', props)
        super(props);
        this.wrapper = React.createRef()
        this.handleClose = this.handleClose.bind(this);

    }

    componentDidMount() {
    }

    handleClose() {
        this.props.callback();
    };

    render() {
        return (
            <Dialog
                ref={this.wrapper}
                open={this.props.open}
                onClose={this.handleClose}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description">
                <DialogTitle id="alert-dialog-title">{this.props.title}</DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        {this.props.message}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={this.handleClose} color="primary">
                        okay
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

}

export default AlertDialog;