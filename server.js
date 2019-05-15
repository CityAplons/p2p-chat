let express = require('express');
let exphbs = require('express-handlebars');
let app = express();
let https = require('https');
const fs = require('fs');

let options = {
    key: fs.readFileSync('./file.pem'),
    cert: fs.readFileSync('./file.crt')
};

let server = https.createServer(options, app);
// Redirect from http port 80 to https
let http = require('http');
http.createServer(function (req, res) {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);

let io         = require('socket.io')(server);
let passport   = require('passport');
let session    = require('express-session');
let bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Passport config
app.use(session({ secret: 'tusurNikMikh',resave: true, saveUninitialized:true}));
app.use(passport.initialize());
app.use(passport.session());

//Static files
app.use(express.static('public'));

//Set handlebars
app.set('views', './views')
app.engine('hbs', exphbs({
    extname: '.hbs'
}));
app.set('view engine', '.hbs');

//Enviroment
let env = require('dotenv').config();
let users = {};

//Socket.io router
require('./v1/socket')(io, users);

//Auth router
const authRouter = require('./v1/auth');
app.use('/', authRouter);

//Util router
const utilRouter = require('./v1/utils');
app.use('/', utilRouter);

//Database init
//Models
var models = require("./models");
 
//Sync Database
models.sequelize.sync().then(function() {
    console.log('Database was initializated successfully! :)')
}).catch(function(err) {
    console.log(err, "Something went wrong with database initialization!")
});

//load passport strategies
require('./config/passport/passport.js')(passport, models.user);

server.listen(443, () => console.log('Relay with SSL is online!'));