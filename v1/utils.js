let express = require('express');
let router = express.Router();
let db = require("../models");

router.param('user_id', function (req, res, next, id) {
    db.user.findByPk(id)
      .then(user => {
        if (!user) res.sendStatus(404);
        else {
            req.user = user;
            return next();
        }
      })
  });

router.get('/:user_id/getUserInfo', (req, res) => {
    res.json({
        username:req.user.username,
        id:req.user.id,
        key:req.user.public_key,
        firstname: req.user.firstname,
        lastname: req.user.lastname
    });
});
router.post('/:user_id/updateKey', (req, res) => {
    if(req.user.public_key !== req.body.raw)
    req.user.update({
       public_key:req.body.raw
   }).then(result => res.status(200).send(result))
});

module.exports = router;