import { google } from 'googleapis';

// Mapeo de días en español a reglas RRULE de Google Calendar
const DAY_MAP = {
  Lunes: 'MO',
  Martes: 'TU',
  Miércoles: 'WE',
  Jueves: 'TH',
  Viernes: 'FR',
  Sábado: 'SA',
  Domingo: 'SU',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const payload = req.body;

  try {
    // 1. Configurar cliente OAuth2 con variables de entorno
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 2. Extraer datos del formulario
    const activityName = payload['Ingrese el Nombre'] || 'Nueva Actividad';
    const category = payload['Qué deseas agendar'];
    const modality = payload['Modalidad'] || 'Virtual';
    const location = payload.location || (modality === 'Presencial' ? 'Presencial' : 'Virtual');
    const reminderMinutes = Number(payload.reminder_minutes ?? 10);

    const startDate = payload['¿Qué dia inicia?'];
    const endDate = payload['¿Qué día finaliza?'] || startDate;
    const startTime = payload['Hora de inicio'] || '08:00';
    const endTime = payload['Hora de finalización'] || '09:00';

    if (!startDate) {
      return res.status(400).json({ error: 'Falta la fecha de inicio.' });
    }

    // Formato ISO con zona horaria de Lima (UTC-5)
    const timeZone = 'America/Lima';
    const startDateTime = `${startDate}T${startTime}:00-05:00`;
    const endDateTime = `${startDate}T${endTime}:00-05:00`;

    // 3. Configurar detalles y descripción
    let description = `Categoría: ${category}\nModalidad: ${modality}\n`;
    if (payload.priority) {
      description += `Prioridad: ${payload.priority}\n`;
    }

// NUEVO: agrega el link de Google Maps si es presencial
if (modality === 'Presencial' && location) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  description += `📍 Ubicación en Maps: ${mapsUrl}\n`;
}

    // 4. Armar el objeto del evento
    const event = {
      summary: `${activityName} [${category}]`,
      description,
      location,
      start: {
        dateTime: startDateTime,
        timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: reminderMinutes },
          { method: 'email', minutes: reminderMinutes },
        ],
      },
    };

    // 5. Manejar recurrencia si es curso libre (varios días repetidos hasta la fecha de fin)
    if (category === 'Estudios' && payload.studyType === 'Libre') {
      const selectedDay = payload['Día de clase'];
      const rruleDay = DAY_MAP[selectedDay] || 'MO';
      // Formato UNTIL en UTC: AAAAMMDDTHHMMSSZ
      const untilDateStr = endDate.replace(/-/g, '') + 'T235959Z';

      event.recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay};UNTIL=${untilDateStr}`];
    }

    // 6. Insertar evento en Google Calendar primario
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return res.status(200).json({
      success: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
    });
  } catch (error) {
    console.error('Error al insertar evento en Calendar:', error);
    return res.status(500).json({
      error: 'Error interno al agendar en Google Calendar',
      details: error.message,
    });
  }
}
