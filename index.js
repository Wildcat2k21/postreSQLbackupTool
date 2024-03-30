const readline = require('readline');
const axios = require('axios');
const fs = require('fs').promises;

//точки для взаимодействия с сервисом
const SERVICE_HOST = 'http://localhost:3000';
const TOOL_CREATE_CONNECTION_END = SERVICE_HOST + '/createConnection';
const TOOL_RESERVE_COPY_END = SERVICE_HOST + '/createTableBackup';
const version = '1.0.0';

//установка воода вывода
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

//получение пользовательского ввода
function getUserInput(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (input) => {
      resolve(input);
    });
  });
}

//новое подключение
async function newConnection(){

    try{
        //информация о базе данных
        const dbOptions = {}

        //значения для подключения к базе данных
        dbOptions.host = await getUserInput('Enter database host: ');
        dbOptions.port = await getUserInput('Enter database port: ');
        dbOptions.database = await getUserInput('Enter database name: ');
        dbOptions.user = await getUserInput('Enter database user: ');
        dbOptions.password = await getUserInput('Enter database password: ');

        console.log('connection...');

        // Выполните POST-запрос к localhost:1234 на endpoint /createConnection
        await axios.post(TOOL_CREATE_CONNECTION_END, dbOptions);

        //Успешно
        console.log('successful ✅\nOne more step, you need enter table name thats you will to be saved');

        //успех
        return true;

    }
    //обработка оишбок
    catch(err){
        console.log("connection error: ", err.message);

        //неудача
        return false;
    }
}

//цикл подключения
async function connectionLoop(){

    let lastCommand, conResult;
    
    while(true){

        //новое подключение
        if(lastCommand === 'reconnect' || lastCommand === undefined){
            conResult = await newConnection();
        }

        //последующие попытки подключения
        if(!conResult){

            //неудача подключения, возможные действия
            console.log('Type "reconnect" to take new turn\nType "exit" to live');
            lastCommand = await getUserInput('next-command: ');

            //переподключение
            if(lastCommand === 'reconnect'){
                continue;
            }
            //если выход
            else if(lastCommand === 'exit'){
                throw false;
            }
            //неизвестная команда
            else{
                console.log(`Undetected command: "${lastCommand}"\n`);
                continue;
            }
        }

        //если успешно
        return;
    }
}

//основная функция
async function main() {
  try {

    //приветственное сообещение
    console.log(`postgreSQL backup json tool v.${version}\n`);

    //новое подключение
    await connectionLoop();            
    
    //последняя команда
    let lastCommand;

    while(true){

        //для первого запуска, нового подключения и явного указания
        if(lastCommand === undefined || lastCommand === 'next' || lastCommand === 'reconnect'){
        
            //новое подключение
            if(lastCommand === 'reconnect') await connectionLoop();   

            //значения для подключения к базе данных
            const name = await getUserInput('Enter table name: ');
        
            //ожидание
            console.log('waiting...');

            // Выполните POST-запрос
            let responseTable = await streamPostMethod(TOOL_RESERVE_COPY_END, {name});

            //если таблицы не существует
            if(JSON.parse(responseTable).status === 404){
                console.log(`Server return status 404: table with name: "${name}" not exists.`);
                continue;
            }

            // ход выполнения
            console.log(`creating ./backup/${name}.backup.json file...`);

            // запись файла
            await fs.writeFile(`backup/${name}.backup.json`, responseTable, 'utf8');

            //успешно
            console.log(`File ${name}.backup.json created successfuly ✅`);

        }
        //неизвестная команда
        else console.log(`Undetected command: "${lastCommand}"\n`);

        //значения для подключения к базе данных
        console.log('Type "reconnect" for new connection\nType "next" for continue deal with inited connection\nType "exit" to live.');

        //новая команда
        lastCommand = await getUserInput('next-command: ');

        //выход
        if(lastCommand === 'exit') break;
        else continue;
    }

    //тут получать данные через чанки

  } 
  //обработка ошибок
  catch (error) {
    //если оишбка
    if(error instanceof Error){
        console.error('Error:', error.message);
    }
    
    //выход
    console.log('exit...');

  }
  //закрыть консоль
  finally {
    rl.close();
  }
}

//получение потока
async function streamPostMethod(url, postData){
    //запрос post на вопросы
    const response = await axios({
        method: 'post',
        data: postData,
        url,
        responseType: 'stream' // <--- сервер будет отвечать потоком
    });

    //полученные в итоге данные
    let data = '';

    //получения данных в потоке
    const resultStream = new Promise((resolve, reject) => {

        // Обработка потока данных
        response.data.on('data', (chunk) => {
            data += chunk;
        });
        
        //окончание потока
        response.data.on('end', () => {
            resolve(data);
        });

        //ошибка потока
        response.data.on('error', (err) => {
            reject(err); // Отклонение Promise в случае ошибки
        });

    });

    //дождатся выполнения потока
    const result = await resultStream;
    return result;
}

main();


// DB_USER = node
// DB_PASS = node
// DB_NAME = Advisor5x
// DB_HOST = localhost
// DB_PORT = 5432
