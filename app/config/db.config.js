module.exports = {
    HOST: "83.136.253.26",
    USER: "lnnam",
    PASSWORD: "mysqladmin",
    DB: "app_salon2025",
    dialect: "mysql",
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }    