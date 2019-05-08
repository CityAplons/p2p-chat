let express = require('express');
let exphbs = require('express-handlebars');
let app = express();
let http = require('http').Server(app);

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

//Socket.io router
const socketRouter = require('./v1/socket');
app.use('/v1/', socketRouter);

//Auth router
const authRouter = require('./v1/auth');
app.use('/', authRouter);

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

http.listen(8080, () => console.log('Relay is online!'));