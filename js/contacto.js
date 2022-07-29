let nombreIngresado;
let emailIngresado;
let telIngresado;
let boton = document.getElementById("buttonEnviar");
let inputNombre = document.getElementById("nombre");
let inputEmail = document.getElementById("email");
let inputTel = document.getElementById("telefono");

inputNombre.addEventListener("input", () => {
  nombreIngresado = inputNombre.value;
});
inputEmail.addEventListener("input", () => {
  emailIngresado = inputEmail.value;
});
inputTel.addEventListener("input", () => {
  telIngresado = inputTel.value;
});

let miFormulario = document.getElementById("formulario");
miFormulario.onsubmit = (e) => {
  e.preventDefault();
  let nombreIngresado = localStorage.getItem("nombre");
  let emailIngresado = localStorage.getItem("email");
  let telIngresado = localStorage.getItem("tel");
  alert("Consulta enviada!!");
  console.log(
    "Datos del usuario: " +
      nombreIngresado +
      " || " +
      emailIngresado +
      " || " +
      telIngresado
  );
};

boton.onclick = () => {
  localStorage.setItem("nombre", nombreIngresado);
  localStorage.setItem("email", emailIngresado);
  localStorage.setItem("tel", telIngresado);
};
