let express = require('express');
let router = express.Router();
let passport  = require('passport');

let authController = require('./controllers/authController.js');
router.get('/signup', authController.signup);
router.get('/',isNotLoggedIn, authController.signin);
router.get('/dashboard',isLoggedIn, authController.dashboard);
router.get('/logout',authController.logout);
router.post('/signup', passport.authenticate('local-signup', {
        successRedirect: '/dashboard',
        failureRedirect: '/signup'
    })
);
router.post('/', passport.authenticate('local-signin', {
        successRedirect: '/dashboard',
        failureRedirect: '/'
    })
);

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())    
        return next();         
    res.redirect('/');
}
function isNotLoggedIn(req, res, next) {
    if (!req.isAuthenticated())    
        return next();         
    res.redirect('/dashboard');
}

module.exports = router;