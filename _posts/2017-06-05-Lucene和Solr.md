---  
lajout: post  
title: Lucene和Solr  
tags: Lucene Solr  
categories: JavaEE  
published: true  
---  

## 信息检索与全文检索

信息检索是从信息集合中找出与用户需求相关的信息，包括文本、图像、视频、音频等多媒体信息

* 全文检索：把用户的查询需求和全文中的每一个分词进行比较，不考虑查询请求与文本语义上的匹配，最具通用性和实用性
* 数据检索：查询要求和信息系统中的数据遵循一定的格式，具有一定的结构，允许特定的字段检索，其性能与使用有很大的局限性，支持语义匹配的能力也很差
* 知识检索：强调基于知识的、语义上的匹配

### 全文索引

#### 建立索引

* 信息采集：把信息源的信息拷贝到本地，构成待检索的信息集合
* 信息加工；为爱刺激到本地的信息编排索引，为查询做好准备

![index](/static/img/Lucene/index.png "index")

#### 分词器

* 文本在建立索引和搜索时都会先分词
* 为了保证能正确搜索到结果，在建立索引与进行搜索时使用的分词器应该是同一个

![keyAnalyzer](/static/img/Lucene/keyAnalyzer.png "keyAnalyzer")

#### 分词步骤

##### 英文分词

![en_analyzer](/static/img/Lucene/en_analyzer.PNG "en_analyzer")

1. 首先切分词
2. 排除停用词：标点符号和“的、了、着、a、an、of”等词语，排除停用词可以加快建立索引的速度，还可以减少索引文件的大小
3. 形态还原：期初单词词尾的形态变化，将其还原为词的原形（worked-work）
4. 转换为小写

##### 中文分词器

* 单词分词：一个字分成一个词（StandardAnalyzer）
* 二分法分词：按每两个字进行切分（CJKAnalyzer）
* 词典分词：按照某种算法构造词，去匹配已经建好的词库集合，匹配到就分为词语（MMAnalyzer极易中文分词、庖丁分词、IK Analyzer等）


#### 索引结构

* 索引文件结构是倒排索引，索引对象是文档中的单词，用来存储这些单词在文档中的位置
* 索引库时一组文本的集合，索引库位置Directory
* 文档Document是Filed的集合，Field的值是文本

![Directory](/static/img/Lucene/Directory.png "Directory")

* 进行检索时，先从检索词汇表（索引表）开始，然后找到相对应的文档
* 倒排索引的维护一般采用先删除后创建的方式替代更新操作，更新操作代价较高

## Lucene

### 创建索引

![store](/static/img/Lucene/store.png "store")

```java
public static final Version LUCENE_43 = Version.LUCENE_43;

public void indexDoc(String directoryPath) throws IOException {
    Directory directory = new SimpleFSDirectory(new File(directoryPath));
    Analyzer analyzer = new SimpleAnalyzer(LUCENE_43);
    IndexWriterConfig indexWriterConfig = new IndexWriterConfig(LUCENE_43, analyzer);
    // prepare directory
    IndexWriter indexWriter = new IndexWriter(directory, indexWriterConfig);
    // prepare document
    ArrayList<IndexableField> indexableFields = new ArrayList<IndexableField>();
    // prepare fields
    IndexableField name = new TextField("name", "c++", Field.Store.YES);
    IndexableField author = new TextField("author", "bob smith", Field.Store.YES);
    IndexableField desc = new TextField("desc", "this is a c book", Field.Store.YES);
    IndexableField size = new StringField("size", "13kb", Field.Store.YES);
    // custom index and store
    FieldType fieldType = new FieldType();
    fieldType.setIndexed(false);// not index
    fieldType.setStored(true);// stored
    IndexableField content = new Field("content", "this is a c++ book content!!!!", fieldType);
    indexableFields.add(name);
    indexableFields.add(author);
    indexableFields.add(desc);
    indexableFields.add(size);
    indexableFields.add(content);
    // store
    indexWriter.addDocument(indexableFields);
    indexWriter.close();
}
```

#### Field.Store 存储域选项

* Field.Store.YES
    - 完全把这个域中的内容完全存储到文件中，可以还原文件内容
* Field.Store.NO
    - 不存储这个域中的内容到文件中，但是不影响索引，无法还原文件内容

#### Field.Index 索引选项

* Index.ANALYZED 进行分词和索引
* Index.NOT_ANALYZED 进行索引，但是不进行分词
* Index.ANALYZED_NOT_NORMS 进行分词但是不存储norms信息，这个norms信息包含了索引时间和权值等
* Index.NOT_ANALYZED_NOT_NORMS 既部分词也不存储norms信息
* Index.NO 不进行索引

**4.0以后Field.Index废弃**

* StringField 不分词并索引的字段，搜索时整字段匹配
* TextField 分词并索引
* StoredField 仅保存，不索引

另外，权重信息可以在Field中指定

```java
FieldType type = new FieldType();
type.setIndexed(true);
type.setStored(true);
type.setIndexOptions(FieldInfo.IndexOptions.DOCS_AND_FREQS);
indexableFields.add(new Field("content", content, type));
```

* FieldInfo.IndexOptions.DOCS_ONLY 索引文档编号
* FieldInfo.IndexOptions.DOCS_AND_FREQS 索引文档编号、关键词频率
* FieldInfo.IndexOptions.DOCS_AND_FREQS_AND_POSITIONS 索引文档编号、关键词频率、位置
* FieldInfo.IndexOptions.DOCS_AND_FREQS_AND_POSITIONS_AND_OFFSETS 索引文档编号、关键词频率、位置、每个关键字偏移量

#### 索引库

* 文件系统索引库；FSDirectory
* 内存索引库：RAMDirectory

```java
public void directoryTest(String directoryPath) throws IOException {
    Directory fsDirectory = new SimpleFSDirectory(new File(directoryPath));
    // 启动时加载文件系统索引库到系统内存索引库
    Directory ramDirectory = new RAMDirectory(fsDirectory, IOContext.DEFAULT);
    IndexWriterConfig indexWriterConfig = new IndexWriterConfig(LUCENE_43, new SimpleAnalyzer(LUCENE_43));
    IndexWriter indexWriter = new IndexWriter(fsDirectory, indexWriterConfig);
    // 退出时保存
    indexWriter.addIndexes(new Directory[]{ramDirectory});
    indexWriter.commit();
    indexWriter.close();
}
```

### 查询索引

```java
public void searchDoc(String[] keywords, String directoryPath) throws IOException {
    Directory directory = new SimpleFSDirectory(new File(directoryPath));
    IndexReader indexReader = DirectoryReader.open(directory);
    // init directory
    IndexSearcher indexSearcher = new IndexSearcher(indexReader);
    // query
    MultiPhraseQuery query = new MultiPhraseQuery();
    query.add(new Term(keywords[0], keywords[1]));
    // filter
    Filter filter = null;
    TopDocs topDocs = indexSearcher.search(query, filter, 1000);// limit 1000
    // count
    System.out.println(topDocs.totalHits);
    for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
        // get doc
        Document doc = indexSearcher.doc(scoreDoc.doc);
        System.out.println(doc.get("name"));
        System.out.println(doc.get("author"));
        System.out.println(doc.get("desc"));
        System.out.println(doc.get("size"));
        System.out.println(doc.get("content"));
        System.out.println("-------------");
    }
}
```

#### Query

##### TermQuery 关键词查询

```java
public void termQueryTest() throws Exception {
    // Term term = new Term("content", "JAVA"); // 英文关键词查询只有小写，没有大写，因为存储时会转换为小写
    Term term = new Term("content", "java");
    Query query = new TermQuery(term);
    indexAndSearchService.searchDoc(query, directoryPath);
}
```

##### TermRangeQuery和NumericRangeQuery 范围查询

```java
public void rangeQueryTest() throws Exception {
    boolean includeLower = true;
    boolean includeUpper = true;
    // supplied range according to Byte.compareTo(Byte).数字2要补0才会算出数字效果
    // BytesRef lowerTerm = new BytesRef("02");
    // BytesRef upperTerm = new BytesRef("20");
    // Query query = new TermRangeQuery("size", lowerTerm, upperTerm, includeLower, includeUpper);
    // 使用数字限定范围
    NumericRangeQuery query =  NumericRangeQuery.newIntRange("order", 0, 77, includeLower, includeUpper);
    indexAndSearchService.searchDoc(query, directoryPath);
}
```

##### WildcardQuery 通配符查询

* `*`：匹配任意个任意字符
* `?`：匹配一个任意字符

```java
Query query = new WildcardQuery(new Term("name","c*"));
Query query = new WildcardQuery(new Term("name","ja??"));
searchService.searchByQuery(query, indexPath);
```

##### PhraseQuery 短语查询

```java
PhraseQuery query = new PhraseQuery();
// 可以指定短语位置
// query.add(new Term("content", "c", 5));
query.add(new Term("content", "c"));
query.add(new Term("content", "指针"));
query.setSlop(20);// 最大间词语个数
searchService.searchByQuery(query, indexPath);
```

##### BooleanQuery 组合查询

BooleanClause.Occur

* MUST和MUST：取交集
* MUST和MUST_NOT：取差集
* SHOULD和SHOULD：取并集

* MUST和SHOULD：结果为MUST结果
* MUST_NOT和MUST_NOT：无意义，无结果
    - MUST_NOT：单独使用无意义，无结果
* MUST_NOT和SHOULD：取差集
    - SHOULD：单独使用同MUST

```java
PhraseQuery query1 = new PhraseQuery();
query1.add(new Term("content", "对象"));
query1.add(new Term("content", "指针"));
query1.setSlop(20);// 最大间词语个数
// Query query = new WildcardQuery(new Term("content","对象"));
// Query query = new WildcardQuery(new Term("name","ja??"));
Query query2 = new TermQuery(new Term("name","kotlin"));
// Query query = new TermQuery(new Term("name", "j"));

BooleanQuery query = new BooleanQuery();
query.add(query1, BooleanClause.Occur.MUST);
query.add(query2, BooleanClause.Occur.MUST);
searchService.searchByQuery(query, indexPath);
```

##### FuzzyQuery  模糊查询

FuzzyQuery的相似度计算使用的Damerau-Levenshtein，FuzzyQuery的transpositions属性设置为false表示启用Damerau-Levenshtein来计算相似度

```java
FuzzyQuery query = new FuzzyQuery(new Term("content","面前"));
searchService.searchByQuery(query, indexPath);
```

#### DateTools

```java
DateTools.dateToString(new Date() , DateTools.Resolution.DAY);// 20170607
DateTools.dateToString(new Date() , DateTools.Resolution.HOUR);// 2017060707
DateTools.dateToString(new Date() , DateTools.Resolution.MILLISECOND);// 20170607073809118
DateTools.dateToString(new Date() , DateTools.Resolution.MINUTE);// 201706070738
```

#### 查询语法

```shell
# TermQuery
name:j
# TermRangeQuery
size:[02 TO 20]
# NumericRangeQuery
order:[1 TO 20]
# WildcardQuery
name:ja??
# PhraseQuery
content:"? 对象 ? 指针"
content:"对象 指针"
content:"对象 指针"~20
# BooleanQuery
+content:"对象 指针"~20 +name:kotlin
# 相关度
name:我^3.0 content:我^2.0
```

查询语法使用QueryParser与MultiFieldQueryParser进行解析

* `+`和`-`：表示后面条件是MUST还是MUST_NOT
* AND：MUST
* OR：SHOULD
* NOT:MUST_NOT
* 可以使用括号就行逻辑组合

#### 排序

* 相关度（默认），在搜索是指定Field的boost，默认1.0f
* 自定义排序，使用Sort，默认为生序

```java
// name:我^3.0 content:我^2.0
Map<String, Float> stringFloatMap = new HashMap<String, Float>();
stringFloatMap.put("name", 3.0f);// 指定boost，默认1.0f
stringFloatMap.put("content", 2.0f);
Analyzer analyzer = new MMSegAnalyzer();
MultiFieldQueryParser queryParser = new MultiFieldQueryParser(Version.LUCENE_43, new String[]{"name", "content"}, analyzer, stringFloatMap);
Query query = queryParser.parse("我是");
searchService.searchByQuery(query, indexPath);
```

```java
Sort sort = new Sort();
boolean reverse = false;// order字段降序排列
sort.setSort(new SortField("order", SortField.Type.INT, reverse));
TopDocs topDocs = indexSearcher.search(query, 200, sort);
```

#### 过滤器

对搜索结果进行过滤，效率低

```java
Filter filter = NumericRangeFilter.newIntRange("order", 35, 45, true, true);
TopDocs topDocs = indexSearcher.search(query, filter, 200, sort);
```

### 分词

```java
public List<String> analyzerTest(String content) throws IOException {
    boolean useSmart = true;
    IKSegmenter ik = new IKSegmenter(new StringReader(content), useSmart);
    Lexeme word;
    List<String> result = new ArrayList<String>();
    while ((word = ik.next()) != null) {
        result.add(word.getLexemeText());
    }
    return result;
}

List<String> strings = indexAndSearchService.analyzerTest("hello,大家好我是一个中国人");
// hello
// 大家好
// 我
// 是
// 一个
// 中国人


public List<String> analyzerDemo(String content) {
    boolean useSmart = true;
    // 构建IK分词器，使用smart分词模式
    Analyzer analyzer = new IKAnalyzer(true);
    // 获取Lucene的TokenStream对象
    TokenStream tokenStream = null;
    List<String> strings = new ArrayList<String>();
    try {
        tokenStream = analyzer.tokenStream("name", new StringReader(content));
        // 获取词元位置属性
        OffsetAttribute offset = tokenStream.addAttribute(OffsetAttribute.class);
        // 获取词元文本属性
        CharTermAttribute term = tokenStream.addAttribute(CharTermAttribute.class);
        // 获取词元文本属性
        TypeAttribute type = tokenStream.addAttribute(TypeAttribute.class);
        // 重置TokenStream（重置StringReader）
        tokenStream.reset();
        // 迭代获取分词结果
        while (tokenStream.incrementToken()) {
            String word = term.toString();
            System.out.println(offset.startOffset() + " - "
                    + offset.endOffset() + " : " + word + " | "
                    + type.type());
            strings.add(word);
        }
        // 关闭TokenStream（关闭StringReader）
        tokenStream.end(); // Perform end-of-stream operations, e.g. set the final offset.
    } catch (IOException e) {
        e.printStackTrace();
    } finally {
        // 释放TokenStream的所有资源
        if (tokenStream != null) {
            try {
                tokenStream.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
    return strings;
}

// 0 - 5 : hello | ENGLISH
// 6 - 9 : 大家好 | CN_WORD
// 9 - 10 : 我 | CN_WORD
// 10 - 11 : 是 | CN_CHAR
// 11 - 13 : 一个 | CN_WORD
// 13 - 16 : 中国人 | CN_WORD
// hello
// 大家好
// 我
// 是
// 一个
// 中国人
```

### 高亮器

用于截取一段文本形成摘要（关键字频率最高的附近多少个字符），并让关键字搞来那个显示（通过前缀和后缀）

```java
public void highlighter(String[] keywords) throws IOException, InvalidTokenOffsetsException, ParseException {
	Analyzer analyzer = new StandardAnalyzer(LUCENE_43);

    QueryParser queryParser = new MultiFieldQueryParser(LUCENE_43, new String[]{"content"}, analyzer);
    Query query = queryParser.parse(keywords[1]);

    Formatter formatter = new SimpleHTMLFormatter("<font color='red'>", "</font>");
    Encoder encoder = new DefaultEncoder();
    Scorer scorer = new QueryScorer(query);
    // init highlighter
    Highlighter highlighter = new Highlighter(formatter, encoder, scorer);
    // 这里指定最大的摘要长度，超过长度会截取
    SimpleFragmenter fragmenter = new SimpleFragmenter(50);
    highlighter.setTextFragmenter(fragmenter);
    // 注意如果没有找到高亮内容会返回空
    String bestFragment = highlighter.getBestFragment(analyzer, "content", "我是中国人");
    System.out.println(bestFragment);
}

// StandardAnalyzer单个分词中文，所以分词结果中分开高亮
// indexAndSearchService.highlighter(new String[]{"name", "中国"});
// 我是<font color='red'>中</font><font color='red'>国</font>人
```

### 数据同步

![sync.png](/static/img/Lucene/sync.png "sync.png")

------

*Lucene教程*