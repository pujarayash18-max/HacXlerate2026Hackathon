using Practical_6.Models;
using System.Collections.Generic;
using System.Web.Mvc;

namespace Practical_6.Controllers
{
    public class ProductController : Controller
    {
        // Index method - returns View
        public ActionResult Index()
        {
            List<Product> products = new List<Product>();

            products.Add(new Product
            {
                ProductId = 1,
                ImageURL = "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
                ProductName = "HP Laptop",
                ProductCategory = "Electronics",
                ProductPrice = 55000
            });

            products.Add(new Product
            {
                ProductId = 2,
                ImageURL = "https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=627&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
                ProductName = "Samsung Galaxy",
                ProductCategory = "Mobile",
                ProductPrice = 35000
            });

            products.Add(new Product
            {
                ProductId = 3,
                ImageURL = "https://plus.unsplash.com/premium_photo-1679513691474-73102089c117?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8SGVhZHBob25lfGVufDB8fDB8fHww",
                ProductName = "Sony Headphones",
                ProductCategory = "Accessories",
                ProductPrice = 5000
            });

            return View(products);
        }
    }
}