/* Каракули — настройки входа через сторонние сервисы.
   Впишите ключи ниже. Пока ключ пустой, кнопка работает в демо-режиме
   (форма «как будто вошли через сервис»), без настоящей проверки.

   Google: console.cloud.google.com → API и сервисы → Учётные данные → Создать → Идентификатор клиента OAuth (Веб-приложение).
           В «Разрешённые источники JavaScript» добавьте адрес сайта (https://ваш-сайт и http://localhost:8080).
           Скопируйте «Client ID» (вида 123-abc.apps.googleusercontent.com) в googleClientId.
   Работает только по http(s), не с файла file://. */
window.KARAKULI_CONFIG = {
  googleClientId: '',
  vkClientId: '',
  yandexClientId: '',
  appleClientId: ''
};
