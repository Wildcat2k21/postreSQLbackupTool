const fs = require('fs').promises;
const chalk = require('chalk');
const cleanMultiSelAns = true;

async function readFile(jsonFileName){
    const fileData = await fs.readFile(`./backup/${jsonFileName}`, 'utf-8');
    return JSON.parse(fileData);
}

//возвращает удаленные id для answer_image
async function cleanAnswer(questions, answers){

    const info = {
        cleaned: [],
        total: answers.length,
        deleted: []
    }

    let text = '';
    questions.forEach(question => {
        const isMultiSelect = question.multy_select;
        if(!isMultiSelect || cleanMultiSelAns){
            const currectExists = answers.find(ans => (ans.is_correct && ans.question_id === question.id));
            answers = answers.filter(ans => {
                if(ans.question_id === question.id && !ans.is_correct && currectExists){
                    info.deleted.push(ans.id);
                    text+=`\n\nQuestion (${question.id}): ${question.title}\n selected(${ans.id}): ${ans.title}\n currect(${currectExists.id}): ${currectExists.title}`;
                    return false;
                }

                return true;
            });
        }
    });


    //очистка пустых ответов
    answers = answers.filter(ans => {
        const isNull = (ans.is_correct === null);
        if(isNull) info.deleted.push(ans.id);
        return !isNull;
    })

    info.cleaned = answers;

    //запись результатов удаления
    await fs.writeFile('./log/deleted_answers.txt', text, 'utf-8');
    console.log(chalk.green('deleted answers writed into ./log/deleted_answers.txt'));
    console.log(`deleted answers: ${info.deleted.length} from ${info.total}`);
    return info;
}

// test - subject_id, question - test_id, asnwer - question_id, answer_image - answer_id, question_image - question_id
async function main(){

    console.log(chalk.green('\n\nYou can open ./modules/cleane.js and configurate it (multi selects also be cleaned)\n'));

    //очиска каритнок для вопросов
    let questionImages = await readFile('question_image.json');
    let cleanedQuestionImages = questionImages.filter(item => item.hash);

    console.log(`deleted question images without hash: ${questionImages.length - cleanedQuestionImages.length} from ${questionImages.length}`);

    //очистка ответов (Для muliti false: если имеется один правильный)) 
    //Насчет multi s: true не уверен, как узнать, полное количетсво ответов
    //Почищу все, добавлю новой столбец колечества ответов. Возвращает удаленные id, для очистки answer_image
    let questions = await readFile('question.json');
    let answers = await readFile('answer.json');
    let cleanedAnsInfo = await cleanAnswer(questions, answers);
    let cleanedAnswers = cleanedAnsInfo.cleaned;
    
    //удаление записей в связанной таблице
    let asnwer_image = await readFile('answer_image.json');
    let clenedAnsImages = asnwer_image.filter(aimg => {
        let findedImg = false;
        cleanedAnsInfo.deleted.forEach(delId => {
            if(delId === aimg.answer_id){
                findedImg = true;
            }
        })

        return !findedImg;
    });

    console.log(`deleted images for answer: ${asnwer_image.length - clenedAnsImages.length} from ${asnwer_image.length}`);

    //удаление вопросов без ответов
    questions = questions.filter(question => {
        const answerForThisQ = cleanedAnswers.some(answer => question.id === answer.question_id);
        return answerForThisQ;
    });

    //третьи переменные
    const questionClone = JSON.parse(JSON.stringify(questions));
    const answerClone = JSON.parse(JSON.stringify(cleanedAnswers));
    const questionImgClone = JSON.parse(JSON.stringify(cleanedQuestionImages));

    //обновление id у quetion
    questions = questions.map((question, n) => {
        const newId = n + 1;
        //обновление у ответов
        cleanedAnswers.forEach((answer, indx) => {
            if(answerClone[indx].question_id === questionClone[n].id){
                cleanedAnswers[indx].question_id = newId;
            }
        });

        //обновление картинок
        cleanedQuestionImages.forEach((image, indx) => {
            if(questionImgClone[indx].question_id === questionClone[n].id){
                cleanedQuestionImages[indx].question_id = newId;
            }
        });

        question.id = newId;
        return question;
    });

    //обновление id у question image
    cleanedQuestionImages = cleanedQuestionImages.map((qImage, n) => {
        qImage.id = n + 1;
        return qImage;
    });

    console.log(`${cleanedQuestionImages.length} idies replaced for question image`);

    let replacedAnsImgCount = 0;
    //третьи переменные
    const answerImgClone = JSON.parse(JSON.stringify(clenedAnsImages));
    //замена id у ответов и картинок
    cleanedAnswers = cleanedAnswers.map((answer, n) => {
        const newId = n + 1;
        clenedAnsImages.forEach((img, indx) => {
            if(answerClone[n].id === answerImgClone[indx].answer_id){
                clenedAnsImages[indx].id = indx + 1;
                clenedAnsImages[indx].answer_id = newId;
                replacedAnsImgCount++;
            }
        });

        answer.id = newId;
        return answer;
    });

    console.log(`${cleanedAnswers.length} idies replaced for answer`);
    console.log(`replaced answer images idies: ${replacedAnsImgCount} from ${clenedAnsImages.length}`);

    //финальная проверка. У всех question должны быть ответы!!!!
    let notFoundAnsImg = [];
    clenedAnsImages.forEach(img => {
        const findedImg = cleanedAnswers.find(answer => img.answer_id === answer.id);
        if(!findedImg){
            notFoundAnsImg.push(img);
        }
    })

    //финальная проверка. У всех question должны быть ответы!!!!
    let notFoundAns = [];
    questions.forEach(question => {
        const findedAns = cleanedAnswers.find(ans => ans.question_id === question.id);
        if(!findedAns){
            notFoundAns.push(question);
        }
    })

    //финальная проверка. У всех question должны быть ответы!!!!
    let notFoundImgQuestion = [];
    cleanedQuestionImages.forEach(img => {
        const findedQuestion = questions.find(question => img.question_id === question.id);
        if(!findedQuestion){
            notFoundImgQuestion.push(img);
        }
    })


    console.log(chalk.green('\nFinal check'));
    console.log('questions without answers: ', notFoundAns.length);
    console.log('question images without questions: ', notFoundImgQuestion.length);
    console.log('answer images without answers: ', notFoundAnsImg.length);

    //запись
    const newQuestionImages = JSON.stringify(cleanedQuestionImages, null, 2);
    const newAnswers = JSON.stringify(cleanedAnswers, null, 2);
    const newAnsImages = JSON.stringify(clenedAnsImages, null, 2);
    const newQuestions = JSON.stringify(questions, null, 2);

    //запись новых файлов
    await fs.writeFile('./cleaned/question_image.json', newQuestionImages, 'utf-8');
    await fs.writeFile('./cleaned/answer.json', newAnswers, 'utf-8');
    await fs.writeFile('./cleaned/answer_image.json', newAnsImages, 'utf-8');
    await fs.writeFile('./cleaned/question.json', newQuestions, 'utf-8');

    //успех
    console.log(chalk.green('Done. created files: \n./cleaned/question_image.json\n./cleaned/answer.json\n./cleaned/answer_image.json\n./cleaned/question.json\n\n'));
}

module.exports = main;