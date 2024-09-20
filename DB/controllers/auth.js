import { client } from '../dbconfig.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cloudinary from '../upload.js';

const JWT_SECRET = process.env.JWT_SECRET;

const login = async (req, res) => {
  const { usuario, contraseña } = req.body;

  // Validación: la contraseña debe tener más de 3 caracteres
  if (!contraseña || contraseña.length <= 3) {
    return res.status(400).send("La contraseña debe tener más de 3 caracteres.");
  }

  try {
    let checkUser;

    // Primero, buscamos en la tabla 'alumnos'
    checkUser = await client.query('SELECT * FROM public.alumnos WHERE "email" = $1', [usuario]);

    // Si no se encuentra en 'alumnos', buscamos en 'profesores'
    if (!checkUser.rows.length) {
      checkUser = await client.query('SELECT * FROM public.profesores WHERE "email" = $1', [usuario]);

      // Si tampoco se encuentra en 'profesores', devolvemos error
      if (!checkUser.rows.length) {
        return res.status(404).send("Usuario no encontrado.");
      }
    }

    // Comparar contraseñas
    const isValidated = await bcrypt.compare(contraseña, checkUser.rows[0].contraseña);
    if (!isValidated) {
      return res.status(401).send("Contraseña incorrecta.");
    }

    // Generar JWT
    const token = jwt.sign(
      { id: checkUser.rows[0].ID, username: checkUser.rows[0].nombre },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Establecer cookie con el token
    res.cookie('access_token', token, {
      maxAge: 1000 * 60 * 60 // Expira en 1 hora
    });

    // Enviar respuesta con el usuario y token
    return res.status(200).json({ usuario: checkUser.rows[0].nombre, token });

  } catch (error) {
    console.error('Error en login:', error.message);
    return res.status(500).send("Error del servidor.");
  }
};


const register = async (req, res) => {
  const { nombre, apellido, email, contraseña, tipoUsuario } = req.body;
  console.log(req.body);

  // Validaciones de campos requeridos
  if (!nombre || !apellido || !email || !contraseña || !tipoUsuario) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  try {
    // Validar si se subió una imagen
    if (!req.file) {
      return res.status(400).send('Error: No se subió ningún archivo.');
    }

    // Obtener la ruta del archivo subido y verificar la extensión
    const imageFile = req.file.path;
    const extension = imageFile.split('.').pop().toLowerCase();
    const extensionesPermitidas = ['pdf', 'png', 'jpeg', 'jpg'];

    if (!extensionesPermitidas.includes(extension)) {
      return res.status(400).send('Error: Extensión de archivo no permitida. Extensiones admitidas: PDF, PNG, JPEG, y JPG');
    }

    // Subir la imagen a Cloudinary
    const resultImage = await cloudinary.uploader.upload(imageFile, {
      folder: 'analisis',
    });
    const imageUrl = resultImage.secure_url;

    // Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedContraseña = await bcrypt.hash(contraseña, salt);

    // Dependiendo del tipo de usuario, insertar en la tabla correspondiente
    let query;
    if (tipoUsuario === 'alumno') {
      query = "INSERT INTO public.alumnos (nombre, apellido, email, contraseña, foto) VALUES ($1, $2, $3, $4, $5) RETURNING *";
    } else if (tipoUsuario === 'profesor') {
      query = "INSERT INTO public.profesores (nombre, apellido, email, contraseña, foto) VALUES ($1, $2, $3, $4, $5) RETURNING *";
    } else {
      return res.status(400).json({ error: 'Tipo de usuario inválido.' });
    }

    const result = await client.query(query, [nombre, apellido, email, hashedContraseña, imageUrl]);

    // Generar un token JWT
    const token = jwt.sign({ id: result.rows[0].id, tipoUsuario }, JWT_SECRET, {
      expiresIn: '1h',
    });

    return res.status(201).json({
      message: `${tipoUsuario.charAt(0).toUpperCase() + tipoUsuario.slice(1)} registrado con éxito`,
      user: result.rows[0],
      token,
      imageUrl,
    });
  } catch (err) {
    console.error('Error al registrar:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};


const auth = {
    login,
    register

}
export default auth;


