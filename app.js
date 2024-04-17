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

//API 1
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

//API 2
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

//API 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
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
  const databaseUser = await database.all(tweetsQuery)

  response.send(databaseUser)
})

//API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const dbase = await database.get(idQuery)
  const {user_id} = dbase
  const tweetsQuery = `
      SELECT user.name
      FROM follower
      JOIN user ON follower.following_user_id = user.user_id
      WHERE follower.follower_user_id = ${user_id};`
  const databaseUser = await database.all(tweetsQuery)

  response.send(databaseUser)
})

//API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const dbase = await database.get(idQuery)
  const {user_id} = dbase
  const tweetsQuery = `   SELECT user.name
      FROM follower
      JOIN user ON follower.follower_user_id = user.user_id
      WHERE follower.following_user_id = ${user_id};`
  const databaseUser = await database.all(tweetsQuery)

  response.send(databaseUser)
})

//API 6
app.get('/tweets/:tweetTd/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const dbase = await database.get(idQuery)
  const {user_id} = dbase
  const tweetQuery = `
  SELECT tweet.tweet,
       COUNT(DISTINCT like.like_id) as likes,
       COUNT(DISTINCT reply.reply_id) as replies,
       tweet.date_time as dateTime
        FROM follower
        JOIN tweet ON follower.following_user_id = tweet.user_id
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE follower.follower_user_id = ${user_id} AND tweet.tweet_id =${tweetId};`

  const tweetsUser = await database.all(tweetQuery)
  if (tweetsUser === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(tweetsUser)
  }
})

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
    const dbase = await database.get(idQuery)
    const {user_id} = dbase

    const selectUserLikesName = `
    SELECT user.username
    FROM follower
    JOIN tweet ON follower.following_user_id = tweet.user_id
    JOIN like ON tweet.tweet_id = like.tweet_id
    JOIN user ON like.user_id = user.user_id
    WHERE follower.follower_user_id = ${user_id}
    AND tweet.tweet_id =${tweetId};`

    const likesQuery = await database.all(selectUserLikesName)
    response.send(likesQuery)
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
    const dbase = await database.get(idQuery)
    const {user_id} = dbase

    const selectUserReplies = `SELECT user.name,
       reply.reply
      FROM reply
      JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id =${tweetId};`

    const repliesQuery = await database.all(selectUserReplies)
    response.send(repliesQuery)
  },
)

//API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const dbase = await database.get(idQuery)
  const {user_id} = dbase
  const tweetQuery = `
  SELECT tweet.tweet AS tweet,
       COUNT(DISTINCT like.like_id) AS likes,
       COUNT(DISTINCT reply.reply_id) AS replies,
       tweet.date_time AS dateTime
      FROM tweet
        LEFT JOIN like ON tweet.tweet_id = like.tweet_id
        LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.user_id = ${user_id}
      GROUP BY tweet.tweet_id;`

  const tweetsUser = await database.all(tweetQuery)
  response.send(tweetsUser)
})

//API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const dbase = await database.get(idQuery)
  const {user_id} = dbase

  const addTweetQuery = `
    INSERT INTO tweet(tweet)
    VALUES('${tweet}');`

  await database.run(addTweetQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const idQuery = `SELECT user_id FROM user WHERE username = '${username}';`
    const dbase = await database.get(idQuery)
    const {user_id} = dbase
    const selectTweetQuery = `SELECT tweet FROM tweet WHERE tweet_id =${tweetId} AND user_id =${user_id};`
    const tweetQuery = await database.get(selectTweetQuery)

    if (tweetQuery === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteTweetQuery = `
  DELETE FROM tweet WHERE tweet_id = ${tweetId} AND user_id = ${user_id};
  `
      await database.run(deleteTweetQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
