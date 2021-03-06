// Express docs: http://expressjs.com/en/api.html
const express = require('express')
// Passport docs: http://www.passportjs.org/docs/
const passport = require('passport')

// pull in Mongoose model for s
const Item = require('../models/item')

// this is a collection of methods that help us detect situations when we need
// to throw a custom error
const customErrors = require('../../lib/custom_errors')

// we'll use this function to send 404 when non-existant document is requested
const handle404 = customErrors.handle404
// we'll use this function to send 401 when a user tries to modify a resource
// that's owned by someone else
const requireOwnership = customErrors.requireOwnership

// this is middleware that will remove blank fields from `req.body`, e.g.
// { : { title: '', text: 'foo' } } -> { : { text: 'foo' } }
const removeBlanks = require('../../lib/remove_blank_fields')
// passing this as a second argument to `router.<verb>` will make it
// so that a token MUST be passed for that route to be available
// it will also set `req.user`
const requireToken = passport.authenticate('bearer', { session: false })

// instantiate a router (mini app that only handles routes)
const router = express.Router()

// INDEX
// GET /s
router.get('/items', requireToken, (req, res, next) => {
  Item.find({owner: req.user.id})
    .then(items => {
      // `s` will be an array of Mongoose documents
      // we want to convert each one to a POJO, so we use `.map` to
      // apply `.toObject` to each one
      return items.map(item => item.toObject())
    })
    // respond with status 200 and JSON of the s
    .then(items => res.status(200).json({ items: items }))
    // if an error occurs, pass it to the handler
    .catch(next)
})

// SHOW
// GET /s/5a7db6c74d55bc51bdf39793
router.get('/items/:id', requireToken, (req, res, next) => {
  // req.params.id will be set based on the `:id` in the route
  Item.findById(req.params.id)
    .then(handle404)
    // if `findById` is succesful, respond with 200 and "" JSON
    .then(item => res.status(200).json({ item: item.toObject() }))
    // if an error occurs, pass it to the handler
    .catch(next)
})

// CREATE
// POST /s
router.post('/items', requireToken, (req, res, next) => {
  // set owner of new  to be current user
  req.body.item.owner = req.user.id

  // make get 'GET' request first to see if item already exists
  Item.find({ owner: req.user.id, name: req.body.item.name }).limit(1)
    .then(checkItemExist => {
      // if length === 1, that item exists in database
      if (checkItemExist.length === 1) {
        // so update that item:
        return Item.findOneAndUpdate({name: req.body.item.name}, req.body.item, {new: true})
      } else {
        // item doesn't exist in database, so create/add item to inventory:
        return Item.create(req.body.item)
      }
    })
  // respond to successful `create` with status 201 and JSON of new ""
    .then(item => {
      res.status(201).json({ item: item.toObject() })
    })
    // if an error occurs, pass it off to our error handler
    // the error handler needs the error message and the `res` object so that it
    // can send an error message back to the client
    .catch(next)
})

// UPDATE
// PATCH /s/5a7db6c74d55bc51bdf39793
router.patch('/items/:id', requireToken, removeBlanks, (req, res, next) => {
  // if the client attempts to change the `owner` property by including a new
  // owner, prevent that by deleting that key/value pair
  delete req.body.item.owner

  Item.findById(req.params.id)
    .then(handle404)
    .then(item => {
      // pass the `req` object and the Mongoose record to `requireOwnership`
      // it will throw an error if the current user isn't the owner
      requireOwnership(req, item)

      // pass the result of Mongoose's `.update` to the next `.then`
      return item.updateOne(req.body.item)
    })
    // if that succeeded, return 204 and no JSON
    .then(() => res.sendStatus(204))
    // if an error occurs, pass it to the handler
    .catch(next)
})

// DESTROY
// DELETE /s/5a7db6c74d55bc51bdf39793
router.delete('/items/:id', requireToken, (req, res, next) => {
  Item.findById(req.params.id)
    .then(handle404)
    .then(item => {
      // throw an error if current user doesn't own ``
      requireOwnership(req, item)
      // delete the  ONLY IF the above didn't throw
      item.deleteOne()
    })
    // send back 204 and no content if the deletion succeeded
    .then(() => res.sendStatus(204))
    // if an error occurs, pass it to the handler
    .catch(next)
})

module.exports = router
