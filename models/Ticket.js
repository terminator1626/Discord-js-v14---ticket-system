const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Ticket = sequelize.define('Ticket', {
    messageId: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

module.exports = Ticket;
