/** Server-only quiz explanations; not imported by browser components. */
export const droneFeedback: Record<string, { en: string; kk: string }> = {
  "drone-1.1-q1": {
    en: "Unmanned means there is no pilot on board. An operator may control the aircraft from the ground.",
    kk: "Ұшқышсыз дегеніміз — бортта ұшқыш жоқ. Оператор аппаратты жерден басқара алады.",
  },
  "drone-1.1-q2": {
    en: "A quadcopter has four lifting propellers; a camera depends on the model and task.",
    kk: "Квадрокоптердің төрт көтергіш винті бар; камера модель мен тапсырмаға байланысты.",
  },
  "drone-1.1-q3": {
    en: "Define the task first, then choose suitable capabilities and equipment.",
    kk: "Алдымен тапсырманы анықтап, содан кейін сәйкес мүмкіндіктер мен жабдықты таңдайды.",
  },
  "drone-1.2-q1": {
    en: "The battery supplies the onboard systems with energy.",
    kk: "Аккумулятор борттағы жүйелерге энергия береді.",
  },
  "drone-1.2-q2": {
    en: "The motor produces rotation. The rotating propeller moves air and creates thrust.",
    kk: "Қозғалтқыш айналуды қамтамасыз етеді. Айналған пропеллер ауаны қозғап, тарту күшін жасайды.",
  },
  "drone-1.2-q3": {
    en: "Data helps the controller compare actual and desired motion and make corrections.",
    kk: "Деректер контроллерге нақты қозғалысты берілген қозғалыспен салыстырып, түзету жасауға көмектеседі.",
  },
  "drone-2.1-q1": {
    en: "Commands are written in the editor; results are observed in the scene.",
    kk: "Командалар редакторда беріледі, ал нәтиже көріністе бақыланады.",
  },
  "drone-2.1-q2": {
    en: "Rotating the camera is not a drone command and does not change its state.",
    kk: "Камераны бұру дрон командасы емес және оның күйін өзгертпейді.",
  },
  "drone-2.1-q3": {
    en: "Reset restores the initial flight state without replacing the program.",
    kk: "Қалпына келтіру бағдарламаны алмастырмай, ұшудың бастапқы күйін қайтарады.",
  },
  "drone-2.2-q1": {
    en: "Altitude is Y, the second number in (X, Y, Z).",
    kk: "Биіктік — Y, (X, Y, Z) жазбасындағы екінші сан.",
  },
  "drone-2.2-q2": {
    en: "Turning changes heading without changing position.",
    kk: "Бұрылу орынды өзгертпей, бағытты өзгертеді.",
  },
  "drone-2.2-q3": {
    en: "After a right turn the heading is +Z, so Z increases from 1 to 3.",
    kk: "Оңға бұрылғаннан кейін бағыт +Z болады, сондықтан Z 1-ден 3-ке өседі.",
  },
  "drone-3.1-q1": {
    en: "The distance is 5 − 1 = 4 cells.",
    kk: "Қашықтық: 5 − 1 = 4 тор.",
  },
  "drone-3.1-q2": {
    en: "The drone must take off first.",
    kk: "Дрон алдымен ұшуы керек.",
  },
  "drone-3.1-q3": {
    en: "It is above the right cell, but Y is 1. Landing lowers Y to 0.",
    kk: "Ол дұрыс тордың үстінде, бірақ Y = 1. Қону Y мәнін 0-ге түсіреді.",
  },
  "drone-3.2-q1": {
    en: "The up argument is an altitude change: 2 + 1 = 3.",
    kk: "up сандық аргументі биіктіктің өзгерісін көрсетеді: 2 + 1 = 3.",
  },
  "drone-3.2-q2": {
    en: "A turn only changes heading. Moving requires a separate command.",
    kk: "Бұрылу тек бағытты өзгертеді. Қозғалу үшін бөлек команда керек.",
  },
  "drone-3.2-q3": {
    en: "Set the new heading by turning first, then move forward.",
    kk: "Алдымен бұрылып жаңа бағытты белгілеңіз, содан кейін алға қозғалыңыз.",
  },
};
