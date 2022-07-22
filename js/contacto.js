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
  console.log("Formulario enviado exitosamente");
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
  alert(
    "Su consulta fue enviada correctamente!!\n En breve recibira una respuesta."
  );
};
