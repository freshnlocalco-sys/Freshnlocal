import https from "node:https";
const urls = [
  "https://images.unsplash.com/photo-1550828553-9f8a846aa1d6",
  "https://images.unsplash.com/photo-1498579809087-ef1e558fd1da",
  "https://images.unsplash.com/photo-1505253304499-671c55fb57fe", // blueberries
  "https://images.unsplash.com/photo-1516684732162-798a0062be99"  // frozen items?
];

urls.forEach(url => {
  https.get(url, res => {
    console.log(url, res.statusCode);
  });
});
