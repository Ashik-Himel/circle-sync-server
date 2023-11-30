const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 5001;

app.use(
  cors({
    origin: [
      "https://circle-sync-1.web.app",
      "https://circle-sync-1.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xeaidsx.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("circle-sync");
    const userCollection = database.collection("users");
    const postCollection = database.collection("posts");
    const voteCollection = database.collection("votes");
    const commentCollection = database.collection("comments");
    const tagCollection = database.collection("tags");
    const announcementCollection = database.collection("announcements");

    // Middlewares
    const verifyUser = (req, res, next) => {
      const token = req.cookies?.token;
      if (!token)
        return res.status(403).send({
          message: "Token Missing",
        });

      jwt.verify(token, process.env.JWT_SECRET, (err, decode) => {
        if (err || req.headers?.authorization !== decode?.email) {
          return res.status(401).send({
            message: "Unauthorize access",
          });
        }

        req.userEmail = decode?.email;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const filter = { email: req.userEmail };
      const user = await userCollection.findOne(filter);

      if (user.role !== "admin")
        return res.status(401).send({
          message: "Unauthorize access",
        });
      next();
    };

    // Users Api
    app.post("/userRole", async (req, res) => {
      const filter = { email: req.body?.email };
      const result = await userCollection.findOne(filter);
      res.send(result);
    });
    app.get("/users", verifyUser, verifyAdmin, async (req, res) => {
      let filter = {};
      if (req.query?.search) {
        filter = { name: { $regex: req.query.search, $options: 'i' } }
      }
      const result = await userCollection.find(filter).skip(req.query?.skip * 10).limit(10).toArray();
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const token = jwt.sign(
        { email: req.body?.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      const filter = { email: req.body?.email };
      const config = {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      };
      const userMatched = await userCollection.findOne(filter);

      if (!userMatched) {
        const document = {
          name: req.body?.name,
          email: req.body?.email,
          role: "bronze",
        };
        const result = await userCollection.insertOne(document);
        res.cookie("token", token, config).send(result);
      } else {
        res.cookie("token", token, config).send(userMatched);
      }
    });
    app.put("/users/:id", verifyUser, verifyAdmin, async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const document = {
        $set: req.body,
      };
      const result = await userCollection.updateOne(filter, document);
      res.send(result);
    });
    app.get("/logout", verifyUser, (req, res) => {
      res.clearCookie("token").send("Ok");
    });
    app.get("/usersCount", verifyUser, verifyAdmin, async (req, res) => {
      const totalUsers = (await userCollection.countDocuments()).toString();
      res.send(totalUsers);
    });
    app.get('/goldUsersCount', verifyUser, verifyAdmin, async(req, res) => {
      const goldUsers = (await userCollection.countDocuments({role: 'gold'})).toString();
      res.send(goldUsers);
    })
    app.put('/updateUserRole', verifyUser, async(req, res) => {
      const filter = {email: req.userEmail};
      const document = {
        $set: req.body
      };
      const result = await userCollection.updateOne(filter, document);
      res.send(result);
    })

    // Posts Api
    app.get("/posts", async (req, res) => {
      const sortByPopularity = req.query.popularity;
      let aggregationPipeline = [
        {
          $sort: { publishedTime: -1 },
        },
      ];
      if (sortByPopularity === "true") {
        aggregationPipeline = [
          {
            $addFields: {
              voteDiff: {
                $subtract: ["$upVote", "$downVote"],
              },
            },
          },
          {
            $sort: { voteDiff: -1 },
          },
        ];
      }
      const result = await postCollection
        .aggregate(aggregationPipeline)
        .skip(req.query?.skip * 5)
        .limit(5)
        .toArray();
      res.send(result);
    });
    app.post("/posts", verifyUser, async (req, res) => {
      const result = await postCollection.insertOne(req.body);
      res.send(result);
    });
    app.get("/posts/:id", async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const result = await postCollection.findOne(filter);
      res.send(result);
    });
    app.delete("/posts/:id", verifyUser, async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const result = await postCollection.deleteOne(filter);
      const filter2 = { postId: req.params.id };
      const result2 = await commentCollection.deleteMany(filter2);
      res.send(result);
    });
    app.get("/postsCount", verifyUser, async (req, res) => {
      const filter = { "author.email": req.query?.email };
      const result = (await postCollection.countDocuments(filter)).toString();
      res.send(result);
    });
    app.get("/totalPostsCount", async (req, res) => {
      const result = (await postCollection.countDocuments()).toString();
      res.send(result);
    });
    app.get("/posts/user/:email", verifyUser, async (req, res) => {
      let aggregationPipeline = [
        {
          $match: { "author.email": req.params.email }
        },
        {
          $sort: { publishedTime: -1 },
        },
      ];
      const result = await postCollection
        .aggregate(aggregationPipeline)
        .skip(req.query?.skip * 10)
        .limit(10)
        .toArray();
      res.send(result);
    });
    app.get("/taggedPosts", async (req, res) => {
      if (!req.query?.tag) return res.send([]);

      filter = { tag: { $regex: req.query?.tag, $options: "i" } };
      const result = await postCollection
        .find(filter)
        .project({ title: 1 })
        .toArray();
      res.send(result);
    });

    // Vote Api
    app.get("/voteState/:postId", verifyUser, async (req, res) => {
      const filter = { email: req.userEmail, postId: req.params.postId };
      const result = await voteCollection.findOne(filter);
      res.send(result);
    });
    app.get("/upVote/:postId", verifyUser, async (req, res) => {
      const filter = { email: req.userEmail, postId: req.params.postId };
      const result = await voteCollection.findOne(filter);
      let response = "";

      if (!result) {
        await voteCollection.insertOne({
          postId: req.params.postId,
          email: req.userEmail,
          status: "upVote",
        });
        await postCollection.updateOne(
          { _id: new ObjectId(req.params.postId) },
          { $inc: { upVote: 1 } }
        );
        response = "new";
      } else {
        if (result.status === "nothing") {
          const document = {
            $set: { status: "upVote" },
          };
          await voteCollection.updateOne(filter, document);
          await postCollection.updateOne(
            { _id: new ObjectId(req.params.postId) },
            { $inc: { upVote: 1 } }
          );
          response = "new";
        } else if (result.status === "upVote") {
          const document = {
            $set: { status: "nothing" },
          };
          await voteCollection.updateOne(filter, document);
          await postCollection.updateOne(
            { _id: new ObjectId(req.params.postId) },
            { $inc: { upVote: -1 } }
          );
          response = "downgrade";
        } else if (result.status === "downVote") {
          const document = {
            $set: { status: "upVote" },
          };
          await voteCollection.updateOne(filter, document);
          await postCollection.updateOne(
            { _id: new ObjectId(req.params.postId) },
            { $inc: { upVote: 1, downVote: -1 } }
          );
          response = "down to up";
        }
      }
      res.send({ response });
    });
    app.get("/downVote/:postId", verifyUser, async (req, res) => {
      const filter = { email: req.userEmail, postId: req.params.postId };
      const result = await voteCollection.findOne(filter);
      let response = "";

      if (!result) {
        await voteCollection.insertOne({
          postId: req.params.postId,
          email: req.userEmail,
          status: "downVote",
        });
        await postCollection.updateOne(
          { _id: new ObjectId(req.params.postId) },
          { $inc: { downVote: 1 } }
        );
        response = "new";
      } else {
        if (result.status === "nothing") {
          const document = {
            $set: { status: "downVote" },
          };
          await voteCollection.updateOne(filter, document);
          await postCollection.updateOne(
            { _id: new ObjectId(req.params.postId) },
            { $inc: { downVote: 1 } }
          );
          response = "new";
        } else if (result.status === "upVote") {
          const document = {
            $set: { status: "downVote" },
          };
          await voteCollection.updateOne(filter, document);
          await postCollection.updateOne(
            { _id: new ObjectId(req.params.postId) },
            { $inc: { upVote: -1, downVote: 1 } }
          );
          response = "up to down";
        } else if (result.status === "downVote") {
          const document = {
            $set: { status: "nothing" },
          };
          await voteCollection.updateOne(filter, document);
          await postCollection.updateOne(
            { _id: new ObjectId(req.params.postId) },
            { $inc: { downVote: -1 } }
          );
          response = "downgrade";
        }
      }
      res.send({ response });
    });

    // Comments Api
    app.post("/comments", verifyUser, async (req, res) => {
      const result = await commentCollection.insertOne(req.body);
      res.send(result);
    });
    app.get("/comments/:id", async (req, res) => {
      if (req.query?.all === 'true') {
        const filter = { postId: req.params.id };
        const result = await commentCollection.find(filter).toArray();
        res.send(result);
        return;
      }
      const filter = { postId: req.params.id };
      const result = await commentCollection.find(filter).skip(req.query?.skip * 10).limit(10).toArray();
      res.send(result);
    });
    app.put("/comments/:id", verifyUser, async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const updatedInfo = {
        $set: req.body,
      };
      const result = await commentCollection.updateOne(filter, updatedInfo);
      res.send(result);
    });
    app.get("/comments/:id/count", async (req, res) => {
      const filter = { postId: req.params.id };
      const result = (await commentCollection.countDocuments(filter)).toString();
      res.send(result);
    });
    app.get("/commentsCount", verifyUser, async (req, res) => {
      const filter = { postAuthorEmail: req.query?.email };
      const result = (await commentCollection.countDocuments(filter)).toString();
      res.send(result);
    });
    app.get("/totalCommentsCount", verifyUser, verifyAdmin, async (req, res) => {
        const totalComments = (await commentCollection.countDocuments()).toString();
        res.send(totalComments);
      }
    );
    app.get('/reportedCommentsCount', verifyUser, verifyAdmin, async(req, res) => {
      const filter = { reportStatus: "Reported" };
      const totalReportedComments = (await commentCollection.countDocuments(filter)).toString();
      res.send(totalReportedComments);
    })
    app.get("/reportedComments", verifyUser, verifyAdmin, async (req, res) => {
      const filter = { reportStatus: "Reported" };
      const result = await commentCollection
        .find(filter)
        .skip(req.query?.skip * 10)
        .limit(10)
        .toArray();
      res.send(result);
    });
    app.put(
      "/reportedComments/:id",
      verifyUser,
      verifyAdmin,
      async (req, res) => {
        const filter = { _id: new ObjectId(req.params.id) };
        const document = {
          $set: req.body,
        };
        const result = await commentCollection.updateOne(filter, document);
        res.send(result);
      }
    );
    app.delete(
      "/reportedComments/:id",
      verifyUser,
      verifyAdmin,
      async (req, res) => {
        const filter = { _id: new ObjectId(req.params.id) };
        const result = await commentCollection.deleteOne(filter);
        res.send(result);
      }
    );
    app.get("/postCommentsCount/:postId", verifyUser, async (req, res) => {
      const filter = { postId: req.params.postId };
      const result = (
        await commentCollection.countDocuments(filter)
      ).toString();
      res.send(result);
    });

    // Tags Api
    app.get("/tags", async (req, res) => {
      const result = await tagCollection.find().toArray();
      res.send(result);
    });
    app.post("/tags", verifyUser, verifyAdmin, async (req, res) => {
      const result = await tagCollection.insertOne(req.body);
      res.send(result);
    });

    // Announcements Api
    app.get("/announcements", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });
    app.post("/announcements", verifyUser, verifyAdmin, async (req, res) => {
      const result = await announcementCollection.insertOne(req.body);
      res.send(result);
    });
    app.get("/announcementsCount", async (req, res) => {
      const result = (await announcementCollection.countDocuments()).toString();
      res.send(result);
    });

    // Payment Api
    app.post('/create-payment-intent', async(req, res) => {
      const amount = parseInt(req.body.amount * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "bdt",
        payment_method_types: ["card"]
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to CircleSync's Server!");
});
app.listen(port);

module.exports = app;
