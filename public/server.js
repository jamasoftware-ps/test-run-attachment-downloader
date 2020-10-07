const express = require('express');
const bodyParser = require('body-parser')
const cors = require('cors');
const app = express();
const client = require('./jama-client');
const port = 3333;


// enable cors for dev
app.use(cors())
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())


// todo: move this into a config file or env variable.
// let credentials = {
//     url: 'https://your-jama.jamacloud.com',
//     username: 'username',   // or client id
//     password: 'password',   // or client secret
//     isBasic: true
// };

// init the client with credentials
// client.init(credentials)

app.post('/login', (req, res) => {
    console.log('req.body', req.body)
    client.init(req.body)
    client.checkConnection().then(success => res.send(success))
        .catch(error => res.send(error))
});

app.get('/check-connection', (req, res) => {
    console.log('client', client);
    if (!client.isInit())
        res.send({isValid: false, message: 'client not initialized'});
    client.checkConnection().then(success => res.send(success))
        .catch(error => res.send(error))
});

app.get('/get-itemtypes', (request, response) => {
    client.getAll('itemtypes')
        .then(success => response.send(success))
        .catch(error => response.send(error))
});


app.get('/get-picklists', (request, response) => {
    console.log('getting all picklists...')
    client.getAll('picklists')
        .then(picklists => {
            for (let i=0; i < picklists.length; i++) {
                let pickList = picklists[i];
                console.log('getting picklist options for' + pickList['name'])
                client.getAll('picklists/' + pickList['id'] + '/options')
                    .then(pickListOptions => {
                        pickList['options'] = pickListOptions;
                        if (i === picklists.length - 1) response.send(picklists)
                    })
                    .catch(error => response.send(error)).then()
            }

        })
        .catch(error => response.send(error))
});


app.listen(port, function(){
    console.log(`Jama Client Test Driver app listening at http://localhost:${port}\n`);
});