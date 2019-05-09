exports.signup = function(req, res) {
     res.render('signup');
}
exports.signin = function(req, res) {
    res.render('signin');
}
exports.dashboard = function(req, res) {
    res.render('dashboard',{
        username: req.user.username,
        id: req.user.id
    });
}
exports.logout = function(req, res) {
    req.session.destroy(function(err) {
        res.redirect('/');
    });
}