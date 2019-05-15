module.exports = function(sequelize, Sequelize) {
    var User = sequelize.define('user', {
        id: {
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER
        },
        firstname: {
            type: Sequelize.STRING,
            notEmpty: true
        },
        lastname: {
            type: Sequelize.STRING,
            notEmpty: true
        },
        username: {
            type: Sequelize.STRING,
            unique: true,
            notEmpty: true,
            validate: {
                isUser: function ( value ) {
                  if ( !/[A-Za-z0-9]+/g.test(value) ) {
                    throw new Error('Username validation error!')
                  }
                },
            }
        },
        public_key: {
            type: Sequelize.TEXT
        },
        password: {
            type: Sequelize.STRING,
            allowNull: false
        },
        last_login: {
            type: Sequelize.DATE
        },
        status: {
            type: Sequelize.ENUM('active', 'inactive'),
            defaultValue: 'active'
        }
    });

    return User;
}