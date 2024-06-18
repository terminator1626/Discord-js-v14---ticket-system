const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const TicketUser = sequelize.define('TicketUser', {
    ticketId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

module.exports = TicketUser;
