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
  ]
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
    app.get('/announcements/count', async(req, res) => {
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