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

// Middlewares
const verify = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.sendStatus(401).send("Unauthorized access");

  jwt.verify(token, process.env.JWT_SECRET, (err, decode) => {
    if (err || req.headers?.authorization !== decode?.email) return res.sendStatus(403).send("Forbidden");

    next();
  })
}


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
    const userCollection = database.collection('users');
    const postCollection = database.collection('posts');
    const commentCollection = database.collection('comments');
    const tagCollection = database.collection('tags');
    const announcementCollection = database.collection('announcements');

    // Users Api
    app.get('/users', async(req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })
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
            name: req.body?.name,
            email: req.body?.email,
            role: "bronze"
          }
          const result = await userCollection.insertOne(document);
          res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
          }).send(result);
        } else {
          res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
          }).send(userMatched);
        }
      }
    })
    app.put('/users/:id', async(req, res) => {
      const filter = {_id: new ObjectId(req.params.id)};
      const document = {
        $set: req.body
      }
      const result = await userCollection.updateOne(filter, document);
      res.send(result);
    })
    app.get('/logout', (req, res) => {
      res.clearCookie('token').send("Ok");
    })
    app.get('/usersCount', async(req, res) => {
      const totalUsers = (await userCollection.countDocuments()).toString();
      const goldUsers = (await userCollection.countDocuments({role: "gold"})).toString();
      res.send({totalUsers, goldUsers});
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
    app.delete('/posts/:id', async(req, res) => {
      const filter = {_id: new ObjectId(req.params.id)};
      const result = await postCollection.deleteOne(filter);
      const filter2 = {postId: req.params.id}
      const result2 = await commentCollection.deleteMany(filter2);
      res.send(result);
    })
    app.get('/postsCount', async(req, res) => {
      const filter = {'author.email': req.query?.email};
      const result = (await postCollection.countDocuments(filter)).toString();
      res.send(result);
    })
    app.get('/totalPostsCount', async(req, res) => {
      const result = (await postCollection.countDocuments()).toString();
      res.send(result);
    })
    app.get('/posts/user/:email', async(req, res) => {
      const filter = {'author.email': req.params.email};
      const option = {
        $sort : {publishedTime: -1}
      }
      const result = await postCollection.find(filter, option).toArray();
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
    app.put('/comments/:id', async(req, res) => {
      const filter = {_id: new ObjectId(req.params.id)};
      const updatedInfo = {
        $set: req.body
      }
      const result = await commentCollection.updateOne(filter, updatedInfo);
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
    app.get('/totalCommentsCount', async(req, res) => {
      const filter = {reportStatus: "Reported"};
      const totalComments = (await commentCollection.countDocuments()).toString();
      const totalReportedComments = (await commentCollection.countDocuments(filter)).toString();
      res.send({totalComments, totalReportedComments});
    })
    app.get('/reportedComments', async(req, res) => {
      const filter = {reportStatus: "Reported"};
      const result = await commentCollection.find(filter).toArray();
      res.send(result);
    })
    app.put('/reportedComments/:id', async(req, res) => {
      const filter = {_id: new ObjectId(req.params.id)};
      const document = {
        $set: req.body
      }
      const result = await commentCollection.updateOne(filter, document);
      res.send(result);
    })
    app.delete('/reportedComments/:id', async(req, res) => {
      const filter = {_id: new ObjectId(req.params.id)};
      const result = await commentCollection.deleteOne(filter);
      res.send(result);
    })

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