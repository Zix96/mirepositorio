//practicas//

/*let ingreseNombre = prompt("Ingrese su Nombre:");
let ingreseApellido = prompt("Ingrese su Apellido:");
let resultado = ingreseNombre + " " + ingreseApellido;
alert("¡Hola!" + " " + resultado);
alert("¿Cuantos años tenes" + " " + resultado + "?");
let ingreseEdad = prompt("Edad:");
console.log(ingreseEdad);
alert("Gracias! Que disfrutes y aprendas mucho de nuestro curso!");*/
/*
let nombreIngresado = prompt ("Ingresar nombre:");
let apellidoIngresado = prompt ("Ingresar apellido:");
let edad = prompt ("Ingrese su edad: ");

if (edad >= 18){
    console.log("puede pasar");
}

else if ((nombreIngresado !="") && (apellidoIngresado !="")){
    console.log("Nombre: " + nombreIngresado + "\nApellido: " + apellidoIngresado);
}
else{
    alert("ERROR: Ingrese nombre y apellido");
}
*/
// actividades brooklet//
//carnet//
/*
let nombre = "Maximiliano";
let apellido = "Berenguer";
let edad = "26";
let fechaNac = "03/03/1996";
let dni = "39469926";
let sexo = "Masculino";
const carnet =
  "NOMBRE: " +
  nombre +
  "\nAPELLIDO: " +
  apellido +
  "\nEDAD: " +
  edad +
  "\nNACIMIENTO: " +
  fechaNac +
  "\nD.N.I: " +
  dni +
  "\nSEXO: " +
  sexo;

console.log(carnet);
*/

// integrantes familia//

/*
let ingreseNombre1 = prompt("Ingrese integrante de familia BERENGUER");
let ingreseNombre2 = prompt("Ingrese integrante de familia BERENGUER");
let ingreseNombre3 = prompt("Ingrese integrante de familia BERENGUER");
let ingreseNombre4 = prompt("Ingrese integrante de familia BERENGUER");
let ingreseNombre5 = prompt("Ingrese integrante de familia BERENGUER");
let berenguer =
  ingreseNombre1 +
  "\n" +
  ingreseNombre2 +
  "\n" +
  ingreseNombre3 +
  "\n" +
  ingreseNombre4 +
  "\n" +
  ingreseNombre5;
alert(berenguer);
*/
// descuentos //
/*
let precio = prompt("ingrese un precio");
let descuento20 = precio - precio * 0.2;
let descuento30 = precio - precio * 0.3;
console.log(descuento20);
console.log(descuento30);*/

// condicionales //

/*
let usuario = prompt("Ingrese nombre de usuario");
if (usuario == "" || " ") {
  alert("ingrese nombre de usuario!!");
} else {
  alert("Bienvenido: " + usuario);
}
*/

//funciones//
/*
function opciones() {
  let tecla = prompt("Seleccione una opción: 'y' o 'Y' ");
  if (tecla == "y") {
    alert("Es correcto");
  } else if (tecla == "Y") {
    alert("Es incorrecto");
  }
}

function personaje() {
  let opcion = prompt("Elije tu personaje: 1.Homero, 2.Marge, 3.Bart, 4.Lisa");
  if (opcion == "1") {
    console.log("Elegiste a Homero");
  } else if (opcion == "2") {
    console.log("Elegiste a Marge");
  } else if (opcion == "3") {
    console.log("Elegiste a Bart");
  } else if (opcion == "4") {
    console.log("Elegiste a Lisa");
  } else {
    console.log("error");
  }
}
personaje();
*/

//Proyecto//

function alumnos() {
  let cantidadAlumno = prompt("Ingrese cantidad de alumnos: ");
  for (let i = 0; i < cantidadAlumno; i++) {
    let nombreAlumno = prompt("Ingrese nombre del alumno: ");
    let notaAlumno = prompt("Ingrese la nota del alumno: ");
    if (notaAlumno >= 4) {
      console.log("El alumno: " + nombreAlumno + " " + "esta aprobado.");
    } else if (notaAlumno <= 3) {
      console.log("El alumno: " + nombreAlumno + " " + "esta desaprobado.");
    }
  }
}
alumnos();
