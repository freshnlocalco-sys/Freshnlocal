const POPULAR_RECIPES = [
  "Avocado Toast", "Banana Bread", "Butter Chicken", "Caesar Salad", "Chicken Curry", 
  "Chicken Tikka Masala", "Chocolate Chip Cookies", "French Toast", "Fruit Smoothie", 
  "Greek Salad", "Grilled Cheese", "Lemonade", "Margherita Pizza", "Oatmeal", 
  "Pancakes", "Paneer Butter Masala", "Pasta Carbonara", "Pesto Pasta", "Smoothie Bowl", 
  "Tomato Soup", "Vegetable Stir Fry", "Mango Lassi", "Chole Bhature", "Palak Paneer", 
  "Dal Makhani", "Biryani", "Mushroom Risotto", "Spaghetti Bolognese", "Tacos", 
  "Guacamole", "Sushi", "Sushi Rolls", "Sausage Roll", "Sausage and Mash", "Sweet and Sour Chicken",
  "Pad Thai", "Ramen", "Pho", "Fajitas", "Enchiladas", "Quesadillas", "Burritos",
  "Beef Stroganoff", "Meatloaf", "Fried Rice", "Macaroni and Cheese", "Lasagna",
  "Chili Con Carne", "Clam Chowder", "French Onion Soup", "Caprese Salad",
  "Eggplant Parmesan", "Chicken Alfredo", "Shrimp Scampi", "Beef Stew",
  "Chicken Noodle Soup", "Fish and Chips", "Shepherd's Pie", "Chicken Pot Pie",
  "Baked Ziti", "Stuffed Peppers", "Roast Chicken", "Beef Brisket", "Pulled Pork",
  "BBQ Ribs", "Chicken Wings", "Nachos", "Spring Rolls", "Dumplings",
  "Teriyaki Chicken", "Katsu Curry", "Bibimbap", "Kimchi Fried Rice",
  "Falafel", "Shawarma", "Hummus", "Baba Ganoush", "Moussaka",
  "Paella", "Gazpacho", "Tortilla Española", "Croissants", "Quiche Lorraine",
  "Ratatouille", "Coq au Vin", "Beef Bourguignon", "Crepes",
  "Waffles", "Eggs Benedict", "Shakshuka", "Huevos Rancheros", "Chilaquiles",
  "Tostadas", "Ceviche", "Empanadas", "Arepas", "Pupusas",
  "Tamales", "Pozole", "Menudo", "Carnitas", "Barbacoa"
].sort();

const query = "M";
const result = POPULAR_RECIPES
  .filter(r => r.toLowerCase().includes(query.toLowerCase()) && r.toLowerCase() !== query.toLowerCase())
  .sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const q = query.toLowerCase();
    if (aLower.startsWith(q) && !bLower.startsWith(q)) return -1;
    if (bLower.startsWith(q) && !aLower.startsWith(q)) return 1;
    return aLower.localeCompare(bLower);
  })
  .slice(0, 5);

console.log(result);
