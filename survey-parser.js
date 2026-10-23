user.answers = Object.keys(event.answer.fields || {}).map(function (id) {
  var question = event.answer.fields[id];
  var value = (event.answer.values || {})[id];

  var answer = Array.isArray(value)
    ? value.join(', ')
    : (value == null || value === '' ? 'Нет ответа' : String(value));

  return question + ' — ' + answer;
}).join('\n\n');
