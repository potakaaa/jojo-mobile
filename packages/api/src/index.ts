import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'jojopotato-api' });
});

app.listen(port, () => {
  console.log(`jojopotato-api listening on port ${port}`);
});
