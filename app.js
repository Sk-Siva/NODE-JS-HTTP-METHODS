const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const databasePath = path.join(__dirname, 'twitterClone.db')

const app = express()

app.use(express.json())

let database = null

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

//AUTHENTICATE TOKEN
function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRET', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//VALIDATE PASSWORD
const validatePassword = password => {
  return password.length > 5
}

//REGISTER API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)
  const hashedPassword = await bcrypt.hash(password, 10)

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, name, password, gender)
     VALUES
      (
       '${username}',
       '${name}',
       '${hashedPassword}',
       '${gender}' 
      );`
    if (validatePassword(password)) {
      await database.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//LOGIN API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)
  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'SECRET')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//TWEETS OF FOLLOWING USER

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const userName = request.username
  const idQuery = `SELECT user_id FROM user WHERE username = '${userName}';`
  const dbase = await database.get(idQuery)
  const {user_id} = dbase
  const tweetsQuery = `
      SELECT
      user.username, tweet.tweet, tweet.date_time AS dateTime
        FROM
      follower
      INNER JOIN tweet
      ON follower.following_user_id = tweet.user_id
      INNER JOIN user
      ON tweet.user_id = user.user_id
      WHERE
      follower.follower_user_id = ${user_id}
      ORDER BY
      tweet.date_time DESC
      LIMIT 4;`
  const databaseUser = await database.run(tweetsQuery)

  response.send(databaseUser)
})

module.exports = app;
