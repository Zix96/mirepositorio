let tabla = document.querySelector(".table");

const botonCompra = document.querySelector(".botonCompra");
botonCompra.addEventListener("click", pushCart);

function pushCart() {
  fetch("/productos.json")
    .then((res) => res.json())
    .then((data) => {
      data.forEach((producto) => {
        let tablaFila = document.createElement("tr");
        tablaFila.innerHTML = `<td>${producto.nombre}</td> <td>${producto.precio}`;
        tabla.append(tablaFila);
      });
    });
}
