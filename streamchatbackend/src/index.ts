import cors from 'cors';
import "dotenv/config";
import express from 'express';

const app = express();

app.use(cors({
    origin: "*",
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Stream Chat Backend is running!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}
);