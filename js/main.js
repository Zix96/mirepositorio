class Producto {
  constructor(id, nombre, precio, categoria) {
    this.id = id;
    this.nombre = nombre;
    this.precio = precio;
    this.categoria = categoria;
  }
  mostrarProducto() {
    return (
      "id: " +
      this.id +
      " Precio: " +
      this.precio +
      " " +
      " Producto: " +
      this.nombre +
      "\n"
    );
  }
}

function comprar(nombre, email, tel, productosEnCarro) {
  let cant = productosEnCarro.reduce((acc, item) => item.precio + acc, 0);
  alert("Gracias" + " " + nombre + " por tu compra. \n Total: $" + cant);
}

let productos = [
  new Producto(1, "Playstation 2", 500, "Consolas"),
  new Producto(2, "Playstation 3", 1000, "Consolas"),
  new Producto(3, "Playstation 4", 3000, "Consolas"),
  new Producto(4, "Playstation 5", 5000, "Consolas"),
  new Producto(5, "Headset para consolas", 300, "Accesorios"),
  new Producto(6, "Estuche para joysticks", 100, "Accesorios"),
  new Producto(7, "Silla gamer", 2500, "Accesorios"),
  new Producto(8, "Soporte para consolas", 250, "Accesorios"),
];

let categorias = ["Consolas", "Accesorios"];

let productosEnCarro = [];

let categoria = "";

while (categoria != "salir" && categoria != null) {
  let aux = categorias.join("\n");
  categoria = prompt(
    'Ingrese un categoria para continuar con su compra o ingrese "salir":\n' +
      aux
  );

  if (categoria != "salir" && categoria != null) {
    let productosFiltradoPorCategoria = productos.filter(
      (item) => item.categoria == categoria
    );

    let cartel = "";
    for (let i = 0; i < productosFiltradoPorCategoria.length; i++) {
      cartel += productosFiltradoPorCategoria[i].mostrarProducto();
    }

    let idSeleccionado = parseInt(
      prompt("Seleccione el id del producto que quiere comprar: \n\n" + cartel)
    );

    let productoParaCarro = productosFiltradoPorCategoria.find(
      (item) => item.id == idSeleccionado
    );

    if (productoParaCarro) {
      productosEnCarro.push(productoParaCarro);
    }
  }
}

if (productosEnCarro.length > 0) {
  alert("Inicie sesion o Registese para terminar tu compra");
  let nombre = prompt("Ingrese su nombre");
  let mail = prompt("Ingrese su email");
  let tel = prompt("Ingrese su tel");
  comprar(nombre, mail, tel, productosEnCarro);
}
