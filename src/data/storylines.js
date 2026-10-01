// One-click storylines: escalating, reproducible sequences of events (useful for
// research sessions where every group must face the same situation at the same minute).
export const STORYLINES = [
  { id: 'escalation', es: 'Escalada en niebla', blurb: 'Niebla → buque cruzando → apagón → MAYDAY de un pesquero.', scenarios: ['tss_night', 'santander_approach', 'strait_crossing', 'biscay_storm'],
    steps: [{ atMin: 2, eventId: 'restricted_visibility' }, { atMin: 6, eventId: 'close_quarters' }, { atMin: 11, eventId: 'blackout' }, { atMin: 16, eventId: 'mayday_relay' }] },
  { id: 'dark-night', es: 'Noche oscura en el DST', blurb: 'Remolque sin AIS, alarma BNWAS, información de tráfico y fallo GNSS.', scenarios: ['tss_night', 'strait_crossing'],
    steps: [{ atMin: 3, eventId: 'dark_tow' }, { atMin: 8, eventId: 'bnwas' }, { atMin: 12, eventId: 'gnss_failure' }, { atMin: 17, eventId: 'close_quarters' }] },
  { id: 'engine-cascade', es: 'Cascada técnica en máquinas', blurb: 'Baja presión de aceite → sentinas → incendio en máquinas.', scenarios: null,
    steps: [{ atMin: 2, eventId: 'me_low_lo' }, { atMin: 7, eventId: 'bilge_alarm' }, { atMin: 12, eventId: 'er_fire' }] },
  { id: 'port-day', es: 'Día de puerto complicado', blurb: 'Cambio de práctico, retraso documental, bunkering con derrame e inspección PSC.', scenarios: ['alongside_bunkering', 'santander_approach'],
    steps: [{ atMin: 2, eventId: 'pilot_change' }, { atMin: 6, eventId: 'berth_delay' }, { atMin: 10, eventId: 'bunker_spill' }, { atMin: 15, eventId: 'psc_inspection' }] },
  { id: 'heavy-weather', es: 'Temporal en Bizkaia', blurb: 'Aviso de temporal → corrimiento de carga → hombre al agua.', scenarios: ['biscay_storm', 'tss_night'],
    steps: [{ atMin: 2, eventId: 'gale_warning' }, { atMin: 8, eventId: 'cargo_shift' }, { atMin: 14, eventId: 'mob' }] },
];
