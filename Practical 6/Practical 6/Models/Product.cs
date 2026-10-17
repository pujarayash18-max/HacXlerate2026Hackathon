using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace Practical_6.Models
{
    public class Product
    {
        public int ProductId { get; set; }
        public string ImageURL { get; set; }
        public string ProductName { get; set; }
        public string ProductCategory { get; set; }
        public decimal ProductPrice { get; set; }
    }
}