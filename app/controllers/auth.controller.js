const db = require("../models");
const config = require("../config/auth.config");
const User = db.user;
//const Role = db.role;

const Op = db.Sequelize.Op;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports.signin = async(req, res) => {
  try {
      const objstore = await db.sequelize.query("select fnLogin('"+req.body.salonkey+"', '"+req.body.username+"', '"+req.body.password+"') as userkey",  
      {
        plain: true
       
      });
    //  const objstore  = JSON.stringify(objstore);
    //  console.log(objstore);
      console.log(objstore.userkey);
      if(objstore.userkey > 0) {
            const token = jwt.sign({ userkey: objstore.userkey },
                                    config.secret,
                                    {
                                      algorithm: 'HS256',
                                      allowInsecureKeySizes: true,
                                      expiresIn: 86400, // 24 hours
                                    });
      
            var authorities = [];
            
              res.status(200).send({
                salonkey: req.body.salonkey,
                userkey: objstore.userkey,
                username: req.body.username,
                roles: authorities,
                accesstoken: token
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

/* exports.signup = (req, res) => {
  // Save User to Database
  User.create({
    username: req.body.username,
    email: req.body.email,
    password: bcrypt.hashSync(req.body.password, 8)
  })
    .then(user => {
      if (req.body.roles) {
        Role.findAll({
          where: {
            name: {
              [Op.or]: req.body.roles
            }
          }
        }).then(roles => {
          user.setRoles(roles).then(() => {
            res.send({ message: "User was registered successfully!" });
          });
        });
      } else {
        // user role = 1
        user.setRoles([1]).then(() => {
          res.send({ message: "User was registered successfully!" });
        });
      }
    })
    .catch(err => {
      res.status(500).send({ message: err.message });
    });
}; */

