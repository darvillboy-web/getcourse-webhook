(function () {
  'use strict';

  if (window.gcTestLessonAnswerInstalled) return;
  window.gcTestLessonAnswerInstalled = true;

  var tests = Object.create(null);
  var sending = Object.create(null);
  var installed = false;

  function lessonId() {
    return new URLSearchParams(location.search).get('id')
      || (location.pathname.match(/\/lesson\/view\/id\/(\d+)/) || [])[1]
      || String(window.lessonId || '');
  }

  function storageKey() {
    var userId = String(window.accountUserId || '');
    return /^\d+$/.test(userId) ? 'gc-test-lesson-answer-v1:' + userId + ':' + lessonId() : null;
  }

  function save() {
    try { var key = storageKey(); if (key) sessionStorage.setItem(key, JSON.stringify(tests)); }
    catch (error) { console.warn('[Тесты] Сохранение во вкладке недоступно.', error); }
  }

  function newTest(id, attemptId) {
    return { questionaryId: String(id), attemptId: String(attemptId || ''), questions: {},
      answers: {}, order: [], finished: false, sent: false, attempted: false };
  }

  function getTest(id) {
    id = String(id);
    if (!tests[id]) {
      tests[id] = newTest(id);
    }
    return tests[id];
  }

  function bindAttempt(test, id) {
    if (!id) return;
    id = String(id);
    if (test.attemptId && test.attemptId !== id) {
      test.answers = {};
      test.order = [];
      test.attempted = false;
      test.finished = false;
      test.sent = false;
    }
    test.attemptId = id;
  }

  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

  function questionText(root) {
    var title = root.querySelector('.question-title-big');
    if (title) return clean(title.textContent);
    // Вопросы с пропусками создают текст из шаблона внутри script.
    var scripts = root.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var match = scripts[i].textContent.match(/\b(?:const|let|var)\s+template\s*=\s*("(?:\\.|[^"\\])*")\s*;/);
      if (match) {
        try {
          var template = document.createElement('template');
          template.innerHTML = JSON.parse(match[1]);
          return clean(template.content.textContent);
        } catch (error) { /* Используем видимый текст ниже. */ }
      }
    }
    var gap = root.querySelector('.gap-text');
    if (!gap) return '';
    var copy = gap.cloneNode(true);
    copy.querySelectorAll('.gap').forEach(function (node) {
      node.replaceWith(document.createTextNode('[]'));
    });
    return clean(copy.textContent);
  }

  function findQuestion(id) {
    var nodes = document.querySelectorAll('.testing-widget [data-question-id]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-question-id') === String(id)) return nodes[i];
    }
    return null;
  }

  function testForQuestion(id, $) {
    var node = findQuestion(id);
    var widget = node && node.closest('.testing-widget');
    var instance = widget && $(widget).data('gc-testingWidget');
    if (instance && instance.options && instance.options.questionaryId) {
      return getTest(instance.options.questionaryId);
    }
    var ids = Object.keys(tests).filter(function (key) {
      return Object.prototype.hasOwnProperty.call(tests[key].questions, id);
    });
    return ids.length === 1 ? tests[ids[0]] : null;
  }

  function notice(test, message, kind) {
    var widget = Array.from(document.querySelectorAll('.testing-widget')).find(function (node) {
      var instance = window.jQuery(node).data('gc-testingWidget');
      return instance && String(instance.options.questionaryId) === test.questionaryId;
    });
    var host = widget || document.querySelector('.testing-widget');
    if (!host) return;
    var box = host.querySelector('.gc-auto-answer-status');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('role', 'status');
      host.appendChild(box);
    }
    box.className = 'gc-auto-answer-status alert alert-' + kind;
    box.textContent = message;
  }

  function answerForm() {
    var field = document.querySelector('[name="LessonAnswer[answer_text]"]');
    return field ? field.closest('form') : null;
  }

  function visibleResponseText(doc) {
    var body = doc.body;
    body.querySelectorAll('script,style,form,textarea,input,select,button').forEach(function (node) { node.remove(); });
    body.querySelectorAll('br').forEach(function (node) { node.replaceWith(doc.createTextNode('\n')); });
    body.querySelectorAll('p,div,li,section,article').forEach(function (node) { node.appendChild(doc.createTextNode('\n')); });
    return clean(body.textContent);
  }

  async function send(test) {
    var answers = test.order.map(function (id) { return test.answers[id]; }).filter(Boolean);
    var key = test.questionaryId + ':' + test.attemptId;
    if (!test.finished || test.sent || test.attempted || sending[key] || !answers.length) return;
    if (!lessonId()) return;

    var blocks = answers.map(function (item, index) {
      var answer = Array.isArray(item.answer) ? item.answer.join(', ')
        : (item.answer == null ? 'Нет ответа' : String(item.answer));
      return 'Q ' + (index + 1) + ': ' + item.question + '\nA ' + (index + 1) + ': ' + answer;
    });
    var answerText = blocks.join('\n\n');
    var form = answerForm();
    var url = new URL(form && form.getAttribute('action') || '/pl/teach/control/lesson/view', location.href);
    if (url.origin !== location.origin) {
      notice(test, 'Не удалось отправить: форма ведёт на другой домен.', 'danger');
      return;
    }
    url.searchParams.set('id', lessonId());

    // Сохраняем скрытые и дополнительные поля существующей формы.
    var body = new URLSearchParams();
    if (form) {
      new FormData(form).forEach(function (value, name) {
        if (typeof value === 'string') body.append(name, value);
      });
    }
    body.set('LessonAnswer[answer_text]', answerText);
    body.set('LessonAnswer[lesson_id]', lessonId());
    body.set('send-answer', 'true');
    if (!body.has('file_upload')) body.set('file_upload', '');
    if (!body.has('LessonAnswer[fileList][add_files]')) body.set('LessonAnswer[fileList][add_files]', '');

    // После начала POST повторять автоматически опасно: сервер мог уже сохранить ответ.
    test.attempted = true;
    test.answerText = answerText;
    sending[key] = true;
    save();
    notice(test, 'Отправляем результаты теста…', 'info');
    try {
      var response = await fetch(url.href, { method: 'POST', body: body, credentials: 'same-origin' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      var errors = Array.from(doc.querySelectorAll('.errorSummary, .error-summary')).map(function (node) {
        return clean(node.textContent);
      }).filter(Boolean);
      if (errors.length) throw new Error(errors.join('; '));
      if (response.url && /\/(?:cms\/system\/login|login)(?:[/?#]|$)/.test(new URL(response.url).pathname)) {
        throw new Error('Требуется авторизация');
      }
      // Подтверждаем результат по тексту ответа за пределами формы ввода.
      if (!visibleResponseText(doc).includes(clean(answerText))) {
        notice(test, 'Запрос отправлен, но сохранение не подтверждено. Обновите страницу и проверьте ответ под уроком.', 'warning');
        console.warn('[Тесты] Сохранение не подтверждено. Автоповтора нет. Текст:', answerText);
        return;
      }
      test.sent = true;
      save();
      notice(test, 'Результаты отправлены. Чтобы увидеть ответ под уроком, обновите страницу.', 'success');
    } catch (error) {
      notice(test, 'Не удалось подтвердить отправку. Обновите страницу и проверьте, появился ли ответ.', 'warning');
      console.error('[Тесты] Отправка не подтверждена; автоматического повтора нет:', error, answerText);
    } finally { delete sending[key]; }
  }

  function install($) {
    if (installed) return;
    installed = true;
    try {
      var saved = storageKey() ? JSON.parse(sessionStorage.getItem(storageKey())) : null;
      if (saved && typeof saved === 'object') tests = Object.assign(Object.create(null), saved);
    } catch (error) { /* Начинаем без сохранённых данных. */ }

    $.ajaxPrefilter(function (options, originalOptions, xhr) {
      var url;
      try { url = new URL(options.url, location.href); } catch (error) { return; }
      if (url.origin !== location.origin || !/^\/pl\/teach\/questionary-public\/(testing|do-question-answer|restart)$/.test(url.pathname)) return;

      var params = new URLSearchParams(
        typeof options.data === 'string' ? options.data : $.param(options.data || {})
      );
      var action = url.pathname.split('/').pop();
      var questionId = params.get('questionId');
      var test = action === 'do-question-answer'
        ? (params.get('questionaryId') ? getTest(params.get('questionaryId')) : testForQuestion(questionId, $))
        : getTest(params.get('questionaryId') || url.searchParams.get('id'));
      if (!test) return;

      // Снимок текста делаем до замены HTML вопроса платформой.
      var node = questionId && findQuestion(questionId);
      var question = node && node.closest('.question');
      var title = question ? questionText(question) : '';

      xhr.done(function (response) {
        try {
          if (typeof response === 'string') response = JSON.parse(response);
          if (!response || response.success !== true || !response.data || response.data.needAuth) return;
          var data = response.data;

          if (action === 'restart') {
            // При ограничении повторных попыток текущие ответы сохраняем.
            if (data.restartTimer) return;
            tests[test.questionaryId] = newTest(test.questionaryId, data.answerId);
          } else if (action === 'do-question-answer') {
            bindAttempt(test, data.questionaryAnswerId || params.get('questionaryAnswerId'));
            var values;
            if (Array.isArray(data.questionAnswers) && data.questionAnswers.length) {
              values = data.questionAnswers.map(function (answer) { return answer.value; });
            } else if (params.get('answerTimeEnd') === '1') {
              values = [];
            } else {
              values = params.getAll('answerValue[]');
              if (!values.length && params.has('answerValue')) values = [params.get('answerValue')];
            }
            var isArray = data.questionType === 'gap' || data.questionType === 'multiple_choice' || params.has('answerValue[]');
            if (test.order.indexOf(questionId) === -1) test.order.push(questionId);
            test.answers[questionId] = {
              questionId: questionId,
              question: title || test.questions[questionId] || '',
              answer: isArray ? values : (values.length ? values[0] : null)
            };
            test.questions[questionId] = test.answers[questionId].question;
          } else if (action === 'testing') {
            bindAttempt(test, params.get('questionaryAnswerId'));
            var doc = new DOMParser().parseFromString(data.resultHtml || '', 'text/html');
            if (data.question_id && doc.querySelector('.question')) {
              test.questions[String(data.question_id)] = questionText(doc);
            }
            if (data.hasActiveQuestion === false && doc.querySelector('.stat-block')) {
              test.finished = true;
            }
          }
          save();
          if (action !== 'restart') send(test);
        } catch (error) {
          // Ошибка сборщика не должна прерывать обработчик самого тестирования.
          console.error('[Тесты] Ошибка разбора ответа:', error);
        }
      });
    });

    Object.keys(tests).forEach(function (id) { send(tests[id]); });

  }

  if (window.jQuery && window.jQuery.ajaxPrefilter) install(window.jQuery);
  else {
    var wait = setInterval(function () {
      if (window.jQuery && window.jQuery.ajaxPrefilter) {
        clearInterval(wait);
        install(window.jQuery);
      }
    }, 50);
    setTimeout(function () {
      clearInterval(wait);
      if (!installed) console.error('[Тесты] jQuery не загрузился за 15 секунд.');
    }, 15000);
  }
})();
