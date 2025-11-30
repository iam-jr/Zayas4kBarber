import express from 'express';  // Usar import en lugar de require
import cors from 'cors';        // Usar import en lugar de require
import bodyParser from 'body-parser'; // Usar import en lugar de require
import { promises as fs } from 'fs'; // Importar fs/promises
import path from 'path';  // Para trabajar con rutas de archivos

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Ruta para obtener todas las reservas
app.get('/api/reservas', async (req, res) => {
  try {
    const bookings = await loadBookings();
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar las reservas' });
  }
});

// Ruta para crear una nueva reserva
app.post('/api/reservas', async (req, res) => {
  const { name, email, phone, service, date, time } = req.body;

  // Verificar que los datos necesarios están presentes
  if (!name || !email || !service || !date || !time) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // Cargar las reservas actuales, añadir la nueva, y guardar
    const bookings = await loadBookings();
    const newBooking = { name, email, phone, service, date, time, created: new Date() };
    bookings.push(newBooking);
    await saveBookings(bookings);

    // Responder con la nueva reserva creada
    res.json({ success: true, booking: newBooking });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar la reserva' });
  }
});

// Función para cargar las reservas desde el archivo JSON (ahora asincrónica)
const loadBookings = async () => {
  const BOOKINGS_FILE = path.join(process.cwd(), 'bookings.json');  // Asegura que la ruta es correcta
  try {
    const data = await fs.readFile(BOOKINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];  // Si no se puede leer el archivo, devolvemos un arreglo vacío
  }
};

// Función para guardar las reservas en el archivo JSON (ahora asincrónica)
const saveBookings = async (data) => {
  const BOOKINGS_FILE = path.join(process.cwd(), 'bookings.json');  // Asegura que la ruta es correcta
  try {
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error al guardar las reservas:', error);
  }
};

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
