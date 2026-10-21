/** Textos de Soporte (español). La forma la replica supportEn.ts. */
export const supportEs = {
  title: "Soporte",
  blurb: "Guías de cada pantalla, preguntas, problemas habituales y un modo práctica que no toca tu expediente.",
  helpButton: "Ayuda de esta pantalla",
  guideTitle: "Guía",
  open: "Abrir Soporte",
  manual: "Manual",
  screensTitle: "Ayuda por pantalla",
  faqTitle: "Preguntas frecuentes",
  troubleTitle: "Problemas habituales",
  glossaryTitle: "Qué significa cada estado",
  missing: "Esa guía no está en esta versión.",
  related: "Recorridos de esta pantalla",
  walk: {
    next: "Siguiente",
    back: "Anterior",
    done: "Listo",
    step: "Paso {n} de {total}",
    lookFor: "Busca este control",
    practice: "Practicar este flujo",
  },
  about: {
    line: "Versión {version} ({channel}) · build {build}",
    linePlain: "Versión {version} · build {build}",
  },
  export: {
    action: "Compartir diagnóstico",
    ok: "Diagnóstico listo para compartir",
    fail: "No se pudo compartir el diagnóstico",
  },
  tips: {
    dismiss: "Entendido, no volver a mostrar",
    reset: "Volver a mostrar los consejos",
    resetDone: "Los consejos vuelven a aparecer en su momento",
    transferSameSession: "¿Vas a otro destino? Usa Iniciar traslado y Confirmar llegada en la misma jornada para que se pague el traslado",
    confirmArrivalInside: "Si ya estás dentro del sitio, el teléfono a veces no avisa solo. Pulsa Confirmar llegada.",
    lunch: "Iniciar almuerzo pausa el rastro. Al cerrar, elige cuántos minutos descontar.",
    provisionalSeal: "Este expediente se selló antes de que terminara la semana. No es el cierre: si cambias horas, genera otro. El sello anterior no se reescribe.",
    splitWeek: "Una jornada que cruza el fin de semana se parte: verás «continúa el lun» (o el día que sigue) y, en la otra semana, «continúa de …».",
    zeroRows: "Las filas de 0 min no salen en el comprobante del empleado. Siguen en el expediente del empleador.",
    forgotClock: "Si olvidaste fichar, corrige inicio y fin en la sesión con una nota. Queda como ajuste manual, no como validada.",
    samsungBattery: "En el Samsung, si la batería restringe la app o está en suspensión, la geocerca puede no fichar. Revisa Salud.",
    readDiag: "En Salud, Diagnóstico de geocerca dice si la entrada se aceptó y por qué se rechazó. No muestra el mapa.",
  },
  practice: {
    title: "Modo práctica",
    banner: "Modo práctica",
    watermark: "PRÁCTICA",
    exit: "Salir del modo práctica",
    enter: "Entrar al modo práctica",
    reset: "Reiniciar la demostración",
    isolated: "Estos datos son de demostración. No se guardan en tu expediente, ni en el registro de integridad, ni en la geocerca.",
    notPayroll: "Las cifras de abajo son un ejemplo fijo. No pasan por el cálculo de nómina.",
    siteA: "Obra norte (demo)",
    siteB: "Obra sur (demo)",
    nextMonday: "lun",
    simulateEnter: "Simular entrada de geocerca",
    autoClose: "Simular cierre automático",
    detectExit: "Simular salida del sitio",
    viewStatement: "Ver el comprobante de ejemplo",
    hideStatement: "Ocultar el comprobante",
    minutesLabel: "Minutos",
    noteLabel: "Nota de la práctica",
    provisional: "Sello de ejemplo, antes de que termine la semana. No es un expediente real.",
    hiddenZero: "Esta fila de 0 min no se imprime en el comprobante del empleado.",
    hours: "8.00 h",
    amount: "$160.00",
    minutes: "480 min",
    zeroMinutes: "0 min",
    zeroAmount: "$0.00",
    errors: {
      ILLEGAL: "Ese paso no corresponde al estado de la práctica.",
      NOTE_REQUIRED: "Escribe una nota: sin ella el ajuste no se guarda ni siquiera en la práctica.",
      ALREADY_OPEN: "Ya hay una jornada de práctica. Ciérrala si sigue abierta, o reinicia la demostración. No se abre una segunda.",
    },
  },
  marks: {
    continuesMonday: "continúa el lun",
  },
  flows: {
    startManual: {
      title: "Iniciar jornada a mano",
      s0: {
        title: "Elige el destino",
        body: "En Hoy pulsa Iniciar jornada y elige un destino guardado. Si ya hay una jornada abierta, la app no abre otra.",
      },
      s1: {
        title: "Quedas esperando",
        body: "La jornada pasa a Esperando llegada y la geocerca vigila solo ese sitio. La hora en que pulsaste no es todavía la hora de llegada.",
      },
      s2: {
        title: "Si ya estabas dentro",
        body: "Si el teléfono ya estaba en el radio, a veces no llega el aviso de entrada. Pulsa Confirmar llegada para fichar en la misma jornada.",
      },
    },
    startGeofence: {
      title: "Iniciar y fichar con la geocerca",
      s0: {
        title: "Permiso de siempre",
        body: "En el Samsung el permiso tiene que ser Permitir siempre, con la ubicación precisa encendida. «Solo al usar la app» no alcanza para fichar con la pantalla apagada.",
      },
      s1: {
        title: "La entrada te ficha",
        body: "Con la jornada en Esperando llegada, al entrar al radio la geocerca puede pasar a En sitio. La hora es la del evento, no la de abrir la app.",
      },
      s2: {
        title: "Si no fichó, mira el diagnóstico",
        body: "Abre Salud y lee Diagnóstico de geocerca. Entrada aceptada confirma el fichaje. Rechazado explica el motivo: precisión, permiso, región de otra jornada u otro.",
      },
    },
    arrival: {
      title: "Llegada y check-in",
      s0: {
        title: "Dos caminos, una jornada",
        body: "La llegada puede ser automática, por la entrada de la geocerca, o manual, con Confirmar llegada. Las dos dejan la jornada En sitio.",
      },
      s1: {
        title: "Qué hora cuenta",
        body: "Cuenta la hora del hecho aceptado o la de tu confirmación. El inicio que declaraste al abrir el día se conserva para comparar.",
      },
    },
    transfer: {
      title: "Traslado y varios destinos",
      s0: {
        title: "La misma jornada",
        body: "¿Vas a otro destino? No pulses Nueva jornada. Cuando salgas, elige Iniciar traslado y el otro destino. El trayecto queda en la misma jornada para que se pague.",
      },
      s1: {
        title: "Confirmar llegada",
        body: "Al llegar, pulsa Confirmar llegada o deja que la geocerca fiche. Cancelar traslado no genera una línea de tránsito.",
      },
      s2: {
        title: "Varios destinos",
        body: "Puedes repetir el traslado en la misma sesión. La geocerca vigila el destino en curso, no todos a la vez. El viaje desde casa, antes de la primera llegada, no es un traslado y no se paga.",
      },
    },
    lunch: {
      title: "Almuerzo y descanso",
      s0: {
        title: "Iniciar almuerzo",
        body: "En sitio, Iniciar almuerzo pasa a En almuerzo. Durante la pausa no hay rastro.",
      },
      s1: {
        title: "Al cerrar",
        body: "Al cerrar eliges si descontar tiempo de almuerzo. Si la jornada cruza el inicio de otra, la app pide la hora en que empezó para descontarlo en el día correcto.",
      },
      s2: {
        title: "Reanudar",
        body: "Reanudar vuelve a En sitio. Finalizar jornada cierra desde el almuerzo.",
      },
    },
    closeManual: {
      title: "Cerrar la jornada a mano",
      s0: {
        title: "Cerrar en el sitio",
        body: "En sitio, Cerrar jornada pregunta el almuerzo y cierra a la hora actual.",
      },
      s1: {
        title: "Cerrar al salir",
        body: "Si saliste del radio, Salida detectada ofrece Cerrar jornada. Confirmar salida usa la hora de la primera salida, no la de la última.",
      },
    },
    closeAuto: {
      title: "Cierre automático",
      s0: {
        title: "Si no respondes",
        body: "Si no decides la salida a tiempo, el vigilante puede cerrar solo. La jornada queda en clase Auto, para revisión, y no se marca Validada en silencio.",
      },
      s1: {
        title: "Otras causas",
        body: "También puede cerrar al llegar al máximo de jornada abierta, por abandono confirmado o si se pierde la ubicación. El registro dice cierre automático.",
      },
    },
    editNote: {
      title: "Editar la sesión con nota",
      s0: {
        title: "Abre la sesión",
        body: "Desde Historial o desde Hoy abre la sesión y pulsa Editar.",
      },
      s1: {
        title: "La nota es obligatoria",
        body: "Si cambias la hora de inicio o de fin, la nota de auditoría es obligatoria. El horario anterior se conserva y la clase pasa a Ajuste. Si la hora no cambia, no se reescriben las horas.",
      },
    },
    forgotClock: {
      title: "Olvidé fichar",
      s0: {
        title: "No se inventa sola",
        body: "Si no abriste el día, ábrelo cuando te acuerdes y corrige el inicio. La app no crea una jornada pasada por su cuenta.",
      },
      s1: {
        title: "Queda como ajuste",
        body: "El cambio se llama ajuste manual y no es Validada. El expediente lo muestra. Si eliminas la sesión, sigue constando como eliminada.",
      },
    },
    sealShare: {
      title: "Sellar y compartir",
      s0: {
        title: "Generar el expediente",
        body: "En Reportes, con jornadas cerradas, Generar expediente sella la semana. Si hay sesiones por revisar, resuélvelas o exporta con sello no certificado.",
      },
      s1: {
        title: "Sello antes del domingo",
        body: "Puedes sellar antes de que termine la semana. El aviso dice que no es el cierre: si agregas jornadas o corriges una que cruza la medianoche, genera otro. El sello anterior no se reescribe.",
      },
      s2: {
        title: "Compartir",
        body: "Compartir comprobante empleado o expediente empleador abre la hoja de compartir del sistema. El código SHA-256 sirve para comparar las dos copias.",
      },
    },
    readStatement: {
      title: "Leer el estado de nómina",
      s0: {
        title: "La semana partida",
        body: "Una jornada que cruza el fin de semana se muestra en dos filas. Donde empezó verás «continúa el lun» (o el día siguiente). En la otra semana, «continúa de …».",
      },
      s1: {
        title: "La columna de minutos",
        body: "Cada fila muestra los minutos de esa porción. Las horas se escriben para que la suma cuadre con el total. El dinero va en centavos enteros: cada línea redondea y el total es la suma.",
      },
      s2: {
        title: "Las filas de cero",
        body: "Una porción de 0 minutos se guarda para la auditoría. En el comprobante del empleado esas filas de $0 no se imprimen. Siguen en el expediente del empleador, y el aviso dice cuántas se omitieron.",
      },
    },
    states: {
      title: "Qué significa cada estado",
      s0: {
        title: "La jornada",
        body: "Fuera de servicio, Esperando llegada, En sitio, En almuerzo, En traslado, Salida detectada y Jornada cerrada son la máquina. Solo puede haber una jornada abierta.",
      },
      s1: {
        title: "La integridad",
        body: "Validada es la clase limpia. Ajuste es un cambio manual con nota. Auto es un cierre del sistema. Revisar es un conflicto entre el GPS y lo manual, y hay que resolverlo.",
      },
      s2: {
        title: "No certificable",
        body: "No certificable no es una clase de integridad. Es un bloqueo: en este dispositivo se guardaron notas o ubicaciones sin cifrar. Las horas siguen; el sello certificado no.",
      },
    },
  },
  screens: {
    today: {
      title: "Hoy",
      intro: "Hoy es el mando de la jornada: iniciar, llegar, almorzar, trasladarte y cerrar. Si la jornada queda en Revisar por falta de señal, aquí confirmas el fin o sigues. El temporizador y el destino salen del estado real.",
      s0: { title: "La acción grande", body: "El botón principal cambia con el estado. Fuera de servicio es Iniciar jornada. En traslado es Confirmar llegada." },
      s1: { title: "No abras otra jornada", body: "Si vas a otro destino, usa Iniciar traslado en la misma jornada. Nueva jornada es para cuando la anterior ya está cerrada." },
    },
    history: {
      title: "Historial",
      intro: "El historial lista las jornadas de la semana, con filtros por integridad y las porciones que cruzan el domingo.",
      s0: { title: "La semana", body: "Las flechas cambian de semana. Todo muestra el historial completo; el resto se queda en la semana elegida." },
      s1: { title: "La fila partida", body: "Si una jornada sigue el lunes, la fila dice «continúa el lun». Una jornada en Revisar por abandono se señala en la lista: ábrela para confirmar el fin o seguir." },
    },
    reports: {
      title: "Reportes",
      intro: "Reportes resume un rango (semana, quincena, mes o fechas) partido en semanas laborales. Las horas extra no se mezclan entre semanas. El sello sigue siendo de una semana.",
      s0: { title: "El rango", body: "Semana actual y semana anterior coinciden con el calendario laboral. Quincena es del 1 al 15 o del 16 al fin de mes. Personalizado pide dos fechas. Más de un año no se acepta." },
      s1: { title: "Sellar", body: "Cada semana se sella sola, con el mismo cálculo de siempre. La suma de arriba no vuelve a repartir las horas extra." },
    },
    settings: {
      title: "Ajustes",
      intro: "Ajustes guarda el perfil y el idioma, el PIN (local o del empleador), el portal y el estado de retención. También abre Salud, destinos y Soporte.",
      s0: { title: "El PIN", body: "Hasta que el empleador aprovisione un código, el primer usuario fija un PIN local. La etiqueta lo dice. El código de un solo uso se pega una vez y caduca. La primera clave pide la huella que el empleador dio por otro canal." },
      s1: { title: "El portal", body: "Si no hay dirección https, no se envía nada: «Portal del empleador: no configurado». Encenderlo pide la zona admin y una dirección https." },
    },
    session: {
      title: "Sesión",
      intro: "La sesión muestra qué declaraste, qué confirmó la zona, la integridad, las líneas y las notas. Si está en Revisar por abandono, aquí confirmas el fin o sigues.",
      s0: { title: "Editar", body: "Editar pide nota si cambias las horas. El horario anterior queda guardado." },
      s1: { title: "La actividad", body: "La línea de tiempo sale del registro, no de una lista fija. Cada paso (llegada, traslado, cierre) es un asiento." },
    },
    trace: {
      title: "Rastro",
      intro: "El rastro dibuja la jornada en el teléfono, sin mapa de calles y sin enviar coordenadas. Debajo sigue la lista de puntos.",
      s0: { title: "El plano", body: "La línea es la miga. El círculo es la geocerca. La marca de llegada es la entrada; otra marca es un traslado. La salida es un punto. El norte queda arriba." },
      s1: { title: "Huecos", body: "Si falta un tramo, no se inventa. Si ya se expurgó por retención, el aviso lo dice. Un punto no fiable no se presenta como llegada limpia." },
    },
    sites: {
      title: "Destinos",
      intro: "Los destinos son los sitios con geocerca. Crear uno no empieza a vigilar: la vigilancia arranca al iniciar la jornada.",
      s0: { title: "Nuevo destino", body: "Nuevo destino pide nombre y dirección. Sin coordenadas resueltas no hay geocerca y la llegada será manual." },
      s1: { title: "Varios sitios", body: "Puedes tener varios. En un traslado eliges el siguiente; la geocerca mira uno a la vez." },
    },
    siteNew: {
      title: "Nuevo destino",
      intro: "Aquí das de alta un sitio. Guardar no abre la jornada ni registra la geocerca del sistema.",
      s0: { title: "La dirección", body: "La dirección tiene que resolverse a un punto. Si no, Hoy podrá iniciar pero no fichará solo." },
      s1: { title: "El radio", body: "El radio es el círculo de la geocerca. Uno muy chico falla con el GPS del coche; uno enorme ficha desde la calle de al lado." },
    },
    siteEdit: {
      title: "Destino",
      intro: "Puedes corregir el nombre, la dirección o el radio. Si este sitio es el que vigila la jornada abierta, la geocerca usa los datos nuevos al guardar.",
      s0: { title: "Guardar", body: "Guardar aplica el cambio. Archivar lo quita de la lista activa y no borra las visitas ya hechas." },
      s1: { title: "El radio", body: "Si cambias el radio a mitad de jornada, la zona vigilada se rearma con el valor nuevo." },
    },
    health: {
      title: "Salud operativa",
      intro: "Salud muestra permisos, batería, reloj y el Diagnóstico de geocerca. Cada sensor dice si bloquea VALIDADA o si solo avisa. También lista las jornadas en revisión.",
      s0: { title: "Diagnóstico de geocerca", body: "Cada fila es hora, tipo, región, precisión y si se aceptó. No hay mapa ni coordenadas. Ubicación, servicio en primer plano y reloj bloquean VALIDADA. Batería, avisos y red solo avisan." },
      s1: { title: "Reparar", body: "Reparar abre el ajuste del sistema que corresponde: ubicación, avisos o batería." },
    },
    conflict: {
      title: "Resolver conflicto",
      intro: "Aquí están las sesiones en Revisar. No se pueden dejar atrás mientras quede una sin decidir.",
      s0: { title: "Conservar GPS", body: "Conservar GPS se queda con el hecho de la zona." },
      s1: { title: "Aceptar el ajuste", body: "Aceptar ajuste manual exige una nota. Dividir parte la jornada en dos si hubo solape." },
    },
    statement: {
      title: "Estado de nómina",
      intro: "El estado de la semana muestra minutos, horas y el total. Los números ya vienen calculados: esta pantalla no los rehace.",
      s0: { title: "Las líneas", body: "Cada línea trae el día, el tipo y los minutos. El importe es el de esa línea, en dólares con centavos." },
      s1: { title: "Minutos", body: "La columna de minutos es el tiempo de esa porción. Una porción que sigue el lunes se lee con «continúa el lun» en el historial y en el expediente." },
    },
    pack: {
      title: "Expediente sellado",
      intro: "El paquete guardado tiene el código SHA-256, la fecha de sello y los archivos. Compartir no lo reescribe.",
      s0: { title: "El código", body: "Empleado y empleador pueden comparar el mismo código. Si regeneras, el nuevo código es otro y el viejo sigue guardado." },
      s1: { title: "Compartir", body: "El comprobante del empleado omite las filas de $0. El expediente del empleador las conserva." },
    },
    welcome: {
      title: "Bienvenida",
      intro: "Dual Tracker separa tu tiempo y el rastro de la jornada. El rastro solo existe mientras hay una jornada abierta.",
      s0: { title: "Continuar", body: "No hay forma de saltarse el alta. El siguiente paso es el descargo de ubicación." },
      s1: { title: "Para qué es", body: "Las horas, el almuerzo, los traslados y el expediente se arman con lo que fiches, no con un cálculo escondido." },
    },
    onboardingDisclosure: {
      title: "Descargo",
      intro: "El descargo explica qué ubicación se guarda y con quién se puede compartir. Hay que aceptarlo para seguir.",
      s0: { title: "Leerlo", body: "El texto es el mismo que luego verás en Legal. Aceptar marca la versión vigente." },
      s1: { title: "Sin aceptar", body: "Sin el descargo aceptado no se inicia la jornada." },
    },
    permissions: {
      title: "Permisos",
      intro: "La ubicación en uso sirve para el check-in. La de segundo plano, en Permitir siempre, hace falta para la geocerca con la pantalla apagada.",
      s0: { title: "Segundo plano", body: "Si niegas el segundo plano, puedes seguir, pero las jornadas no podrán certificarse como validadas." },
      s1: { title: "Avisos", body: "Las notificaciones avisan la salida y el recordatorio. Sin ellas el cierre automático puede pillarte sin decidir." },
    },
    profile: {
      title: "Tu perfil",
      intro: "Nombre, tarifa, idioma y hora del recordatorio. La empresa y el PIN se configuran después, en la zona admin.",
      s0: { title: "Idioma", body: "Español o English cambian las pantallas del alta que sigan abiertas, antes de pulsar Entrar." },
      s1: { title: "Entrar", body: "Entrar guarda el perfil en este teléfono. La tarifa, después, solo se cambia con el PIN de administración." },
    },
    legalDisclosure: {
      title: "Descargo vigente",
      intro: "Es el texto legal que está en vigor, el mismo del alta. Cambiar el idioma de la interfaz lo muestra en ese idioma; no pide aceptarlo otra vez.",
      s0: { title: "Solo lectura", body: "Desde Ajustes se consulta. No se edita aquí." },
      s1: { title: "Volver", body: "Volver regresa a Ajustes o al paso del alta desde el que llegaste." },
    },
    legalRetention: {
      title: "Retención",
      intro: "La política de retención dice cuánto tiempo se guarda el rastro en el teléfono.",
      s0: { title: "Las dos condiciones", body: "El rastro de un periodo se borra solo si ese periodo ya se exportó y, además, pasaron los días de retención desde su fin. Sin exportar, no se borra." },
      s1: { title: "Volver", body: "Volver regresa sin cambiar nada." },
    },
    notFound: {
      title: "No encontrado",
      intro: "El enlace no corresponde a una sesión, un expediente o una pantalla de esta versión.",
      s0: { title: "Ir a Hoy", body: "Ir a Hoy te deja en el mando de la jornada." },
      s1: { title: "Volver", body: "Si llegaste desde otra app, vuelve atrás o abre Hoy." },
    },
    boot: {
      title: "Abriendo",
      intro: "Al arrancar se abre el expediente guardado en el teléfono. Esta pantalla no inicia una jornada.",
      s0: { title: "Espera", body: "Restaurando expediente es normal. Cuando termina, entras a Hoy o al alta." },
      s1: { title: "Si falla", body: "Si no se puede abrir, Reintentar vuelve a intentarlo. No borra los datos por su cuenta." },
    },
    support: {
      title: "Soporte",
      intro: "Manual, ayuda de cada pantalla, preguntas, problemas, estados, práctica y un diagnóstico para compartir.",
      s0: { title: "El manual", body: "Cada recorrido se puede seguir paso a paso. El control resaltado es el de la pantalla real." },
      s1: { title: "La práctica", body: "Entrar al modo práctica usa datos de demostración, aparte de tu expediente." },
    },
    practice: {
      title: "Modo práctica",
      intro: "Aquí puedes iniciar, llegar, trasladarte, almorzar, cerrar, anotar y sellar sin escribir tu expediente.",
      s0: { title: "La cinta", body: "Mientras veas Modo práctica, lo que pulses se queda en la demostración." },
      s1: { title: "Salir", body: "Salir borra la demostración y vuelves a tus jornadas reales, tal como estaban." },
    },
  },
  faq: {
    commute: {
      q: "¿Se paga el viaje desde casa?",
      a: "No. El tiempo desde casa hasta el primer sitio no es un traslado. El traslado pagado es el que declaras, en la misma jornada, entre dos destinos: Iniciar traslado y luego Confirmar llegada.",
    },
    sameSession: {
      q: "¿Por qué no abro una jornada nueva al ir a otra obra?",
      a: "Porque el trayecto solo se paga dentro de la jornada que ya está abierta. Iniciar traslado y Confirmar llegada dejan los dos sitios y el camino en la misma sesión.",
    },
    alwaysAllow: {
      q: "¿Qué es Permitir siempre?",
      a: "Es el permiso de ubicación en segundo plano de Android. Hace falta para que la geocerca fiche con la pantalla apagada. «Solo al usar la app» no basta.",
    },
    precise: {
      q: "¿Qué es la ubicación precisa?",
      a: "Es el GPS fino, no solo la red del teléfono. Si está apagada, la precisión puede ser peor que el radio y el diagnóstico rechaza la entrada.",
    },
    samsung: {
      q: "¿Qué hago en un Samsung con la batería agresiva?",
      a: "Quita Dual Tracker de las apps en suspensión, pon la batería en sin restricciones y no dejes que Doze la optimice. Si no, el sistema duerme la geocerca.",
    },
    autoFail: {
      q: "¿Por qué no me fichó solo al llegar?",
      a: "Puede fallar el permiso, la precisión, la batería, o porque ya estabas dentro cuando se armó la geocerca y Android no manda la entrada. Confirmar llegada resuelve ese caso. El motivo concreto está en Salud.",
    },
    readDiag: {
      q: "¿Cómo leo Diagnóstico de geocerca?",
      a: "En Salud, cada fila es una entrada, salida, muestra o error. Aceptado significa que la jornada avanzó. Rechazado trae el motivo, por ejemplo precisión mayor que el radio o falta de Permitir siempre. No guarda ni muestra coordenadas.",
    },
    notifications: {
      q: "¿Para qué son las notificaciones?",
      a: "Avisan que saliste del sitio, con botones para seguir, cerrar o trasladarte, y el recordatorio de la mañana. Sin ellas puedes no enterarte de una salida.",
    },
    language: {
      q: "¿El idioma cambia las guías y los PDF?",
      a: "La interfaz, incluidas estas guías, cambia al momento. Un PDF ya sellado no se reescribe: se queda como se generó.",
    },
    provisional: {
      q: "¿Puedo sellar a mitad de semana?",
      a: "Sí. Ese sello es provisional: el aviso lo dice. Si después agregas o corriges jornadas, genera otro expediente. El anterior no se modifica.",
    },
    splitWeek: {
      q: "¿Qué es «continúa el lun»?",
      a: "La jornada cruzó el corte de la semana. La fila de esta semana muestra hasta el corte y dice que continúa el día siguiente, a menudo el lunes. La otra semana muestra el resto.",
    },
    zeroRows: {
      q: "¿Por qué falta una jornada de cero minutos en el comprobante?",
      a: "El comprobante del empleado oculta las filas de 0 min y de $0. El expediente del empleador las conserva, y un aviso dice cuántas se omitieron.",
    },
    practice: {
      q: "¿El modo práctica mezcla mis horas?",
      a: "No. Vive en otro sitio del teléfono, no en la base de las jornadas, ni en el registro de integridad, ni en los expedientes, ni en la geocerca. Al salir, tus datos reales siguen igual.",
    },
    offline: {
      q: "¿Las guías necesitan internet?",
      a: "No. El texto va dentro de la app, con el número de guía que ves en Soporte. Sin cobertura se leen igual.",
    },
    orphanShift: {
      q: "¿Qué es una jornada en Revisar por abandono?",
      a: "Si el teléfono dejó de dar señal más del hueco de heartbeat y no hay una lectura dentro del sitio, la jornada no se cierra sola. En Hoy, en el detalle y en Salud puedes confirmar la hora de fin, con nota, o seguir trabajando. No se inventan horas.",
    },
    validSensors: {
      q: "¿Qué impide una jornada VALIDADA?",
      a: "La ubicación (en uso, segundo plano y servicios del sistema), el servicio en primer plano y la integridad del reloj. La batería, las notificaciones, la red y la geocerca solo avisan. Salud lo marca en cada fila.",
    },
    clockDrift: {
      q: "¿Qué pasa si el reloj del teléfono no coincide con la hora de red?",
      a: "Con red, la app compara el reloj con dos sitios conocidos. Usa el punto medio de la ida y vuelta y descarta una muestra lenta. Solo anota deriva si varias lecturas separadas coinciden, y lo hace una vez por jornada. Si la ubicación de esa jornada es buena, queda como aviso y no quita el estado validado. Un salto del reloj del teléfono sí deja la jornada en revisión. Sin red no se bloquea por la hora de red.",
    },
    packSignature: {
      q: "¿El expediente va firmado?",
      a: "Los expedientes nuevos llevan una firma del teléfono (Ed25519) junto al código de verificación y la huella de la clave. Los anteriores, sin firma, siguen siendo válidos. El PDF ya sellado no se reescribe. Una firma que cuadra no identifica al teléfono si no se compara esa huella con la que se anotó aparte.",
    },
    retentionBoth: {
      q: "¿Cuándo se borra el rastro?",
      a: "Solo si el periodo ya se exportó y pasaron los días de retención desde el fin de ese periodo. Las dos cosas. Un periodo sin exportar no se toca. Las entradas y salidas se conservan. En el plano, lo borrado se ve como un hueco, no como una línea inventada.",
    },
    employerPin: {
      q: "¿Quién pone el PIN de administración?",
      a: "Si el empleador no ha aprovisionado el teléfono, lo fija la primera persona que lo use. Ajustes lo llama PIN local (no aprovisionado por empleador). Un código de un solo uso, que caduca, deja el PIN del empleador. El PIN no va dentro del código: te lo dicen aparte. La primera clave no se fija sola: hay que teclear la huella que el empleador dio por otro canal, o el build tiene que traer esa clave anclada. Una clave distinta no entra hasta que desbloquees la zona admin. Tras varios fallos el teléfono espera; los escalones siguen igual.",
    },
    employerPortal: {
      q: "¿Se envían los expedientes a un portal?",
      a: "No, salvo que la zona admin escriba una dirección https y encienda el envío. Sin eso, Ajustes dice Portal del empleador: no configurado y no sale nada del teléfono. La cola muestra pendiente, enviado o falló. Un fallo espera y reintenta. El PDF no se sube: se manda el manifiesto firmado, el estado de nómina y el resumen de evidencia.",
    },
    reportRange: {
      q: "¿Puedo ver más de una semana en Reportes?",
      a: "Sí. Semana actual, semana anterior, quincena, mes o dos fechas. El fin no puede ser anterior al inicio ni el rango pasar de un año. Las horas extra se calculan semana por semana, como el expediente. Sellar sigue siendo de una semana.",
    },
    offlineMap: {
      q: "¿El mapa del rastro usa internet?",
      a: "No. No hay calles ni clave de mapas. El plano se dibuja con los puntos que ya están en el teléfono. Un tramo expurgado queda como hueco. Las coordenadas cifradas solo se leen aquí para pintarlas.",
    },
  },
  trouble: {
    permissionAlways: {
      title: "El permiso no quedó en Permitir siempre",
      body: "Ajustes del teléfono, Aplicaciones, Dual Tracker, Permisos, Ubicación, y elige Permitir siempre. En Salud, Segundo plano tiene que decir Concedido. Reparar abre esa pantalla.",
    },
    preciseLocation: {
      title: "La ubicación precisa está apagada",
      body: "En el permiso de ubicación del Samsung activa Usar ubicación precisa. Sin eso el diagnóstico puede decir que la precisión es mayor que el radio y rechazar la entrada.",
    },
    samsungBattery: {
      title: "Samsung: batería, apps en suspensión y Doze",
      body: "Ajustes, Batería y cuidado del dispositivo, Límites de uso en segundo plano. Quita Dual Tracker de Apps en suspensión y de las apps inactivas. En la ficha de la app, Batería, elige Sin restricciones. Así Doze no duerme la geocerca mientras la jornada está abierta.",
    },
    autoCheckIn: {
      title: "El check-in automático no ocurrió",
      body: "Confirma Permitir siempre, ubicación precisa y batería sin restricciones. Si ya estabas dentro al iniciar, pulsa Confirmar llegada: Android a menudo no repite la entrada. Luego abre Salud y lee la última fila del diagnóstico.",
    },
    readDiag: {
      title: "Cómo leer Diagnóstico de geocerca",
      body: "Salud, sección Diagnóstico de geocerca. Lee la hora, el tipo (entrada, salida, muestra, error) y si dice Aceptado o Rechazado. El motivo traducido está debajo: permiso, precisión, región vieja o sin jornada. No verás coordenadas: no se guardan en esa lista.",
    },
    notifications: {
      title: "No llegan los avisos de salida",
      body: "En Salud, Notificaciones tiene que estar Concedido. En el Samsung revisa también que las notificaciones de la app no estén silenciadas. Sin ese permiso no aparecen los botones de seguir, cerrar o trasladar.",
    },
    language: {
      title: "El idioma no cambió en una guía",
      body: "En Soporte, o en Ajustes, pulsa Español o English. El texto de la guía que estás leyendo cambia en el acto. Si un PDF ya compartido sigue en español, es lo esperado: el archivo sellado no se regenera.",
    },
    commute: {
      title: "El trayecto desde casa no apareció como tránsito",
      body: "Es el comportamiento de la app: ese tramo no se paga. Para que el camino entre dos obras cuente, tiene que ser un traslado de la misma jornada, con llegada confirmada en el segundo destino.",
    },
  },
  glossary: {
    manualPatch: "Ajuste manual es el nombre del cambio de horas con nota. En la pastilla de integridad se lee Ajuste, no Validada.",
    machine: {
      NO_INICIADA: "Fuera de servicio: no hay jornada abierta. Puedes iniciar una.",
      ESPERANDO: "Esperando llegada: la jornada está abierta y la geocerca vigila el destino. Aún no es hora de trabajo en sitio.",
      ACTIVA: "En sitio: llegaste, a mano o por la geocerca. El tiempo en el destino corre.",
      PAUSADA: "En almuerzo: pausa sin rastro. Reanudar vuelve a En sitio.",
      TRASLADO: "En traslado: vas a otro destino dentro de la misma jornada. Confirmar llegada cierra el tramo.",
      SALIDA: "Salida detectada: el sistema vio que saliste y espera tu decisión. La hora que cuenta es la primera salida.",
      CERRADA: "Jornada cerrada: ya no corre el tiempo. Puedes revisarla o iniciar otra.",
    },
    integrity: {
      VALID: "Validada: la jornada no tuvo un ajuste manual ni un cierre automático ni un conflicto abierto.",
      MANUAL: "Ajuste: alguien cambió las horas y dejó nota, o se aceptó un ajuste al resolver un conflicto. No es Validada.",
      AUTO: "Auto: la cerró el sistema (plazo de salida, tope de jornada u otra causa automática). Queda distinguida de una validada.",
      CONFLICT: "Revisar: el GPS y lo declarado no coinciden, o la integridad se degradó. Hay que resolverla antes de un sello certificado.",
      BLOCKED: "No certificable: bloqueo de cifrado, no una clase de la pastilla. Hubo notas o ubicaciones sin cifrar en este dispositivo. Las horas se guardan; el sello certificado no.",
    },
  },
};
