const db = require("../models");
const config = require("../config/auth.config");
const User = db.user;
//const Role = db.role;

const Op = db.Sequelize.Op;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports._token_encode = (userkey, username, salonkey) => {
  return jwt.sign({ userkey: userkey, username: username, salonkey: salonkey },
    config.secret,
    {
      algorithm: 'HS256',
      allowInsecureKeySizes: true,
      expiresIn: 86400, // 24 hours
    });
}

exports.signin = async(req, res) => {
  try {
      const objstore = await db.sequelize.query("select fnLogin('"+req.body.salonkey+"', '"+req.body.username+"', '"+req.body.password+"') as userkey",  
      {
        plain: true
       
      });
    
      if(objstore.userkey > 0) {
           
            const token = this._token_encode(objstore.userkey, req.body.username, req.body.salonkey);
      
            var authorities = [];
            
              res.status(200).send({
                salonkey: req.body.salonkey,
                userkey: objstore.userkey,
                username: req.body.username,
                roles: authorities,
                token: token
              });
        } else {
          return res.status(401).send({
            message: "Unauthorized!",
          });
        }
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}

