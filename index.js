const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://circle-sync-1.web.app',
    'https://circle-sync-1.firebaseapp.com'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xeaidsx.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const database = client.db('circle-sync');
    const tagCollection = database.collection('tags');
    const announcementCollection = database.collection('announcements');
    const postCollection = database.collection('posts');
    const commentCollection = database.collection('comments');
    const userCollection = database.collection('users');

    // Tags Api
    app.get('/tags', async(req, res) => {
      const result = await tagCollection.find().toArray();
      res.send(result);
    })
    app.post('/tags', async(req, res) => {
      const result = await tagCollection.insertOne(req.body);
      res.send(result);
    })

    // Announcements Api
    app.get('/announcements', async(req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    })
    app.post('/announcements', async(req, res) => {
      const result = await announcementCollection.insertOne(req.body);
      res.send(result);
    })
    app.get('/announcementsCount', async(req, res) => {
      const result = (await announcementCollection.countDocuments()).toString();
      res.send(result);
    })

    // Posts Api
    app.get('/posts', async(req, res) => {
      const sortByPopularity = req.query.popularity;
      let aggregationPipeline = [
        {
          $sort : {publishedTime: -1}
        }
      ];
      if (sortByPopularity === 'true') {
        aggregationPipeline = [
          {
            $addFields: {
              voteDiff : {
                $subtract: ['$upVote', '$downVote']
              }
            }
          },
          {
            $sort: {voteDiff: -1}
          }
        ]
      }
      const result = await postCollection.aggregate(aggregationPipeline).toArray();
      res.send(result);
    });
    app.post('/posts', async(req, res) => {
      const result = await postCollection.insertOne(req.body);
      res.send(result);
    })
    app.get('/posts/:id', async(req, res) => {
      const filter = {_id: new ObjectId(req.params.id)};
      const result = await postCollection.findOne(filter);
      res.send(result);
    })
    app.get('/postsCount', async(req, res) => {
      const filter = {'author.email': req.query?.email};
      const result = (await postCollection.countDocuments(filter)).toString();
      res.send(result);
    })

    // Comments Api
    app.post('/comments', async(req, res) => {
      const result = await commentCollection.insertOne(req.body);
      res.send(result);
    })
    app.get('/comments/:id', async(req, res) => {
      const filter = {postId: req.params.id};
      const result = await commentCollection.find(filter).toArray();
      res.send(result);
    })
    app.get('/comments/:id/count', async(req, res) => {
      const filter = {postId: req.params.id};
      const result = (await commentCollection.countDocuments(filter)).toString();
      res.send(result);
    })
    app.get('/commentsCount', async(req, res) => {
      const filter = {postAuthorEmail: req.query?.email};
      const result = (await commentCollection.countDocuments(filter)).toString();
      res.send(result);
    })

    // Users Api
    app.post('/users', async(req, res) => {
      const data = req.body;
      const filter = {email: data?.email};
      const userMatched = await userCollection.findOne(filter);

      if (req.body?.setToken === false) {
        res.send(userMatched);
      } else {
        const token = jwt.sign({email: req.body?.email}, process.env.JWT_SECRET, {expiresIn: "7d"});
        if (!userMatched) {
          const document = {
            email: req.body?.email,
            role: "bronze"
          }
          const result = await userCollection.insertOne(document);
          res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
          }).send(result);
        } else {
          res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
          }).send(userMatched);
        }
      }
    })
    app.get('/logout', (req, res) => {
      res.clearCookie('token').send("Ok");
    })
    app.get('/usersCount', async(req, res) => {
      const totalUsers = (await userCollection.countDocuments()).toString();
      const goldUsers = (await userCollection.countDocuments({role: "gold"})).toString();
      res.send({totalUsers, goldUsers});
    })
    

    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB Connected!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("Welcome to CircleSync's Server!");
})
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port} !`);
})

module.exports = app;