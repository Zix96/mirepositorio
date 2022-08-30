(function () {
  fetch("/productos.json")
    .then((res) => res.json())
    .then((data) => {
      data.forEach((producto) => {
        // Crear dinamicamente las tarjetas

        let tarjeta = document.createElement("div");
        tarjeta.classList.add("card1");

        // Crear el elemento Imagen
        let foto = document.createElement("img");
        foto.classList.add("imagen-ps5");
        foto.src = producto.imagen;

        // Crear el titulo
        let titulo = document.createElement("h3");
        titulo.classList.add("card1-title");
        titulo.innerText = producto.nombre;

        //Crear descuento
        let descuento = document.createElement("p");
        descuento.classList.add("descuento");
        descuento.innerText = "%10 DE DESCUENTO";

        // Crear el precio
        let precio = document.createElement("p");
        precio.classList.add("precio");
        precio.innerText = producto.precio;

        //Precio anterior
        let precioAnterior = document.createElement("p");
        precioAnterior.classList.add("precio-");
        precioAnterior.innerText = producto.precioAnterior;

        // Agregar elementos a la tarjeta
        tarjeta.appendChild(foto);
        tarjeta.appendChild(descuento);
        tarjeta.appendChild(titulo);
        tarjeta.appendChild(precioAnterior);
        tarjeta.appendChild(precio);

        // Crear el boton
        let boton = document.createElement("button");
        boton.classList.add("botonCompra");
        // Asocia el id de producto para poder emparejarlo con el array de productos
        boton.id = producto.id;
        boton.innerText = "AGREGAR A MI COMPRA";

        // Agregar el evento click
        boton.addEventListener("click", pushToCart);

        // Agregar el boton a la tarjeta
        tarjeta.appendChild(boton);

        // Agregar la tarjeta a la lista de tarjetas
        let element = document.getElementById("cards-flex");
        element.appendChild(tarjeta);
      });
    });
})();

// Funcion para agregar al carrito

function pushToCart(evt) {
  // Obtener el id del producto que esta en la tarjeta donde se hizo click
  const idProducto = parseInt(evt.currentTarget.id);
  Toastify({
    text: "Producto agregado correctamente",
    className: "info",
    style: {
      background: "linear-gradient(to right, #00b09b, #96c93d)",
    },
  }).showToast();

  // Volver a traer los productos para buscar el que se quiere agregar
  fetch("/productos.json")
    .then((res) => res.json())
    .then((data) => {
      data.forEach((producto) => {
        // Si el id se encuentra en la lista
        if (producto.id === idProducto) {
          // Agregarlo a la tabla del carrito
          let tabla = document.querySelector(".table");
          let tablaFila = document.createElement("tr");
          tablaFila.innerHTML = `<td>${producto.nombre}</td> <td>${producto.precio}</td>`;
          tabla.append(tablaFila);
        }
      });
    });
}
