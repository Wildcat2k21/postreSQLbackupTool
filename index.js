const readline = require('readline');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const cleaneBackups = require('./modules/cleane');

//точки для взаимодействия с сервисом
const SERVICE_HOST = 'http://localhost:3000'; //https://jsonpostresqlbackuptoolservice.onrender.com 'http://localhost:3000'
const TOOL_CREATE_CONNECTION_END = SERVICE_HOST + '/createConnection';
const TOOL_RESERVE_COPY_END = SERVICE_HOST + '/createTableBackup';
const RESTORE_TABLES_END = SERVICE_HOST + '/restoreTables';
const RESTORE_DATA_END = SERVICE_HOST + '/restoreData';
const CLOSE_POOL_END = SERVICE_HOST + '/closeConnection';
const version = '1.0.0';

//пуки в файлом восстановления базы данных
const dbSqlPath = 'sql/database.sql';
const backupDir = 'backup';

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
        dbOptions.host = await getUserInput(chalk.green('Enter database host: '));
        dbOptions.port = await getUserInput(chalk.green('Enter database port: '));
        dbOptions.database = await getUserInput(chalk.green('Enter database name: '));
        dbOptions.user = await getUserInput(chalk.green('Enter database user: '));
        dbOptions.password = await getUserInput(chalk.green('Enter database password: '));

        console.log('connection...');

        // Выполните POST-запрос к localhost:1234 на endpoint /createConnection
        await axios.post(TOOL_CREATE_CONNECTION_END, dbOptions);

        //Успешно
        console.log(chalk.green(`connected to ${dbOptions.database} successfuly ✅`));

        //успех
        return true;

    }
    //обработка оишбок
    catch(err){
        console.error(chalk.red("connection error: ", err.message));

        //неудача
        return false;
    }
}

//цикл подключения
async function connectionLoop(){

    let lastCommand = 'reconnect', conResult;
    
    while(true){

        //новое подключение
        if(lastCommand === 'reconnect'){
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
                console.log(chalk.red(`Undetected command: "${lastCommand}"`));
                continue;
            }
        }

        //если успешно
        return true;
    }
}

//создание резервных копий
async function createTableBackup(name){
    try{
        console.log('waiting...');
        let responseTable = await streamPostMethod(TOOL_RESERVE_COPY_END, {name});
        console.log(`INFO : creating ./backup/${name}.json file...`);

        // запись файла
        await fs.writeFile(`backup/${name}.json`, responseTable, 'utf8');
        console.log(chalk.green(`File ${name}.json created successfuly ✅`));

        return true;
    }
    //обработка ошибок
    catch(err){
        console.error(chalk.red('Error: ', err.message));
        return false;
    }
}

//чтение файла
async function readFileByPath(filePath) {
    const fileData = await fs.readFile(filePath, 'utf-8');
    return fileData;
}

//чтение всех json файлов
async function readAllJsonFilesInDirectory(directoryPath) {
    try {
        const files = await fs.readdir(directoryPath);
        const filesData = [];
        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            const stat = await fs.stat(filePath);
            if (!stat.isDirectory() && file.endsWith('.json')) {
                // Читаем только файлы с расширением .json
                const jsonContent = await fs.readFile(filePath, 'utf-8');
                filesData.push({
                    name: file.replace('.json', ''),
                    content: JSON.parse(jsonContent)
                });

                console.log(chalk.green(`Readed ${file}`));
            }
        }
        
        //содержимое файлов в массиве
        return filesData;

    } catch(err) {
        console.error(chalk.red('Reading file error:', err.message));
    }
}

//восстановление базы данных
async function restoreDatabase(){
    try{
        console.log(`reading ./${dbSqlPath}...`);
        const sql = await readFileByPath(dbSqlPath);
        console.log('File database.sql readed successfuly ✅\nExecuting...');
        await axios.post(RESTORE_TABLES_END, {sql});
        console.log(chalk.green('Database restored successfuly 🎉🎉🎉'));

    }catch(err){
        console.error(chalk.red("Restore database error:", err.message));
    }
}

//восстановление данных
async function restoreData(){
    try{
        console.log('Reading json buckups...');
        const backups = await readAllJsonFilesInDirectory(backupDir);
        console.log(`Readed ${backups.length} files.\nExecuting...`);
        await fillData(backups);
        console.log(chalk.green('Data restored successfuly 🎉🎉🎉'));

    }catch(err){
        console.error(chalk.red("Restore data error:", err.message));
    }
}

//восстановление базы данных
async function fillData(data){
    const jsonString = JSON.stringify(data);
    let resResult;
    await parseRequestText(jsonString, 1000, async(jsonStrPart, isEnd, index, lastIndex) => {
        resResult = await axios.post(RESTORE_DATA_END, {jsonStrPart, isEnd, index, lastIndex});
        console.log(`Posting... ${index}/${lastIndex}`);
    });

    console.log('Data sended ✅\nRestoring...');
    return resResult;
}

//основная функция
async function main() {
  try {

    //предыдущая команда
    let nextCommand = "help";
    let connected = false;

    while(true){

        //основной блок комманд
        if(!connected){
            switch(nextCommand){

                //первая команда
                case "help":
                    console.log(`Type: "help" for show commands.\n"connect" for connect to database (to backup or restore)\n"cleane" for cleane crated json backups (need crated json tables backups)\n"exit" to live`);
                    break

                //подключится к базе данных
                case "connect": 
                    connected = await connectionLoop();
                    nextCommand = "help";
                    continue;

                //подключится к базе данных
                case "cleane": 
                    connected = await cleaneBackups();
                    nextCommand = "help";
                    continue;

                //выход
                case "exit":
                    throw false

                default: 
                    console.log(chalk.red(`Undetected command: "${nextCommand}", type "help" for show commands`));
                    break;
            }
        }
        //если подключение выполнено
        else{
            switch(nextCommand){

                //первая команда
                case "help":
                    console.log(`Type: "help" for show commands.\n"backup" for create backup of table \n"restore database" for restore your database (need database.sql file without data in ./sql)\n"restore data" for restore your data (need restored database and exists .json backups of tables in ./backup)\n"cleane" for cleane crated json backups (need crated .json backups of tables )\n"reconnect" for new connection\n"exit" to live`);
                    break

                //переподключится
                case "reconnect": 
                    //предыдущая команда
                    nextCommand = "connect";
                    connected = false;
                    continue;

                //подключится к базе данных
                case "cleane": 
                    connected = await cleaneBackups();
                    nextCommand = "help";
                    continue;

                //восстановить базу
                case "backup": 
                    let tableName = await getUserInput("Enter table name for save: ");
                    await createTableBackup(tableName);
                    nextCommand = "help";
                    continue;

                //восстановить базу данных
                case "restore database":
                    await restoreDatabase();
                    nextCommand = "help";
                    continue;

                //восстановить базу данных
                case "restore data":
                    await restoreData();
                    nextCommand = "help";
                    continue;

                //восстановить базу данных
                case "exit":
                    console.log('closing connection...');
                    await axios.post(CLOSE_POOL_END, {});
                    throw false

                default: 
                    console.log(chalk.red(`Undetected command: "${nextCommand}", type "help" for show commands`));
                    break;
            }
        }

        //следующая команда
        nextCommand = await getUserInput("Enter command (without /): ");
        continue;
    }
  } 
  //обработка ошибок
  catch(err) {
    //если оишбка
    if(err instanceof Error){
        console.error(chalk.red('Error:', err.message));
    }
    
    //выход
    console.log(chalk.green('exit...'));
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

//разбитие строки json на подстроки для запроса порциями
async function parseRequestText(jsonString, length, callback){

    //инициализация
	let startAt = 0;
	let isEnd = false;
    let lastIndex = Math.floor(jsonString.length/length);
	
  //следующая часть
	async function next(start){
		if(start + length >= jsonString.length){
			isEnd = true;
		}
		//текущая часть
		let jsonStrPart = jsonString.slice(start, start + length);
        //текущий индекс
        let index = start/length;
		//функция callback
        await callback(jsonStrPart, isEnd, index, lastIndex);
		//проверка
		if(start + length < jsonString.length){
          //следующий вызов
          await next(start + length);
		}
	}
	
    //следующий индекс
	await next(startAt);
}

//приветственное сообещение
console.log(chalk.green(`Advisor postgreSQL backup json tool v.${version}\n`));
main();