module.exports = function(sequelize, Sequelize) {
    var Stash = sequelize.define('stash', {
        id: {
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER
        },
        from: {
            type: Sequelize.INTEGER,
            notEmpty: true
        },
        to: {
            type: Sequelize.INTEGER,
            notEmpty: true
        },
        message: {
            type: Sequelize.TEXT,
            notEmpty: true
        },
        time: {
            type: Sequelize.TEXT
        }
    });

    return Stash;
}