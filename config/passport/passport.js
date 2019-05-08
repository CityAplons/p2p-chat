let bcrypt = require('bcrypt');
module.exports = function(passport, user) {
    let User = user;
    let LocalStrategy = require('passport-local').Strategy;

    //signup strategy
    passport.use('local-signup', new LocalStrategy(
        {
            usernameField: 'username',
            passwordField: 'password',
            passReqToCallback: true
        },
        function(req, username, password, done) {
            var generateHash = function(password) {
                return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
            };

            User.findOne({
                where: {
                    username: username
                }
            }).then(function(user) {
                if (user)
                {
                    return done(null, false, {
                        message: 'That username is already taken'
                    });
                } else {  
                    var userPassword = generateHash(password);
                    var data =
                        {
                            username:username,
                            password: userPassword,
                            firstname: req.body.firstname,
                            lastname: req.body.lastname,
                            email: req.body.email
                        };
             
             
                    User.create(data).then(function(newUser, created) {
                        if (!newUser) {
                            return done(null, false);
                        }
             
                        if (newUser) {
                            return done(null, newUser);
                        }
                    });
                }
            });
        }
    ));
    
    //signin strategy
    passport.use('local-signin', new LocalStrategy(
        {
            usernameField: 'username',
            passwordField: 'password',
            passReqToCallback: true
        },
     
        function(req, username, password, done) {
            var User = user;
            var isValidPassword = function(userpass, password) {
                return bcrypt.compareSync(password, userpass);
            }
     
            User.findOne({
                where: {
                    username: username
                }
            }).then(function(user) {
                if (!user) {
                    return done(null, false, {
                        message: 'Account does not exist'
                    });
                }
     
                if (!isValidPassword(user.password, password)) {
                    return done(null, false, {
                        message: 'Incorrect password.'
                    });
                }
     
                var userinfo = user.get();
                return done(null, userinfo);
     
            }).catch(function(err) {
                console.log("Error:", err);
                return done(null, false, {
                    message: 'Something went wrong with your Signin'
                });
            });
        }
    ));

    //serialize
    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });
    // deserialize user 
    passport.deserializeUser(function(id, done) {
        User.findByPk(id).then(function(user) {
            if (user) {
                done(null, user.get());
            } else {
                done(user.errors, null);
            }
        });
    });

}