---
layout: post
title: ZooKeeper
tags: ZooKeeper
categories: JavaEE
published: true
---

相对于开发在一台计算机上运行的单个程序，如何让一个应用中多个独立的程序协同工作是一件非常困难的事情。

* 开发这样的应用，很容易让很多开发人员陷入如何使多个程序协同工作的逻辑中，最后导致没有时间更好地思考和实现他们自己的应用程序逻辑；
* 又或者开发人员对协同逻辑关注不够，只是用很少的时间开发了一个简单脆弱的主协调器，导致不可靠的单一失效点。

ZooKeeper的设计保证了其健壮性，这就使得应用开发人员可以更多关注应用本身的逻辑，而不是协同工作上。

* ZooKeeper从文件系统API得到启发，提供一组简单的API，使得开发人员可以实现通用的协作任务，包括选举主节点、管理组内成员关系、管理元数据等。
* ZooKeeper包括一个应用开发库（主要提供Java和C两种语言的API）和一个用Java实现的服务组件。
* ZooKeeper的服务组件运行在一组专用服务器之上，保证了高容错性和可扩展性。

当你决定使用ZooKeeper来设计应用时，最好将应用数据和协同数据独立开。

## ZooKeeper的概念和基础

### ZooKeeper的使命

关于ZooKeeper这样的系统功能的讨论都围绕着一条主线：它可以在分布式系统中协作多个任务。一个协作任务是指一个包含多个进程的任务。这个任务可以是为了协作或者是为了管理竞争。

* 协作意味着多个进程需要一同处理某些事情，一些进程采取某些行动使得其他进程可以继续工作。
	* 在典型的主-从（master-worker）工作模式中，从节点处于空闲状态时会通知主节点可以接受工作，于是主节点就会分配任务给从节点。
* 竞争则不同。它指的是两个进程不能同时处理工作的情况，一个进程必须等待另一个进程。
	* 在主-从工作模式中，很多进程都想成为主节点，因此需要实现互斥排他锁（mutual exclusion）。
* 协同并不总是采取像群首选举或者加锁等同步原语的形式。配置元数据也是一个进程通知其他进程需要做什么的一种常用方式。
	* 在一个主-从系统中，从节点需要知道任务已经分配到它们。即使在主节点发生崩溃的情况下，这些信息也需要有效。

虽然许多消息传递算法可以实现同步原语，但是使用一个提供某种有序共享存储的组件往往更加简便，这正是ZooKeeper所采用的方式。

Zookeep的客户端API功能强大，其中包括：

* 保障强一致性、有序性和持久性。
* 实现通用的同步原语的能力。
* 在实际分布式系统中，并发往往导致不正确的行为。ZooKeeper提供了一种简单的并发处理机制。

#### 通过ZooKeeper构建分布式系统

本文内容对分布式系统的定义为：分布式系统是同时跨越多个物理主机，独立运行的多个软件组件所组成的系统。

使用一个独立的协调组件有几个重要的好处：

* 首先，可以独立地设计和实现该组件，这样独立的组件可以跨多个应用共享。
* 其次，系统架构师可以简化协作方面的工作。
* 最后，系统可以独立地运行和协作这些组件，独立这样的组件，也简化了生产环境中解决实际问题的任务。

分布式系统中的进程通信有两种选择：

直接通过网络进行信息交换，或读写某些共享存储。

ZooKeeper使用共享存储模型来实现应用间的协作和同步原语。对于共享存储本身，又需要在进程和存储间进行网络通信。

在真实的系统中，需要特别注意以下问题：

* 消息延迟
	* 消息传输可能会发生任意延迟，比如，因为网络拥堵。这种任意延迟可能会导致不可预期的后果。
	* 比如，根据基准时钟，进程P先发送了一个消息，之后另一个进程Q发送了消息，但是进程Q的消息也许会先完成传送。
* 处理器性能
	* 操作系统的调度和超载也可能导致消息处理的任意延迟。
	* 当一个进程向另一个进程发送消息时，整个消息的延时时间约等于发送端消耗的时间、传输时间、接收端的处理时间的总和。如果发送或接收过程需要调度时间进行处理，消息延时会更高。
* 时钟偏移
	* 使用时间概念的系统并不少见，比如，确定某一时间系统中发生了哪些事件。处理器时钟并不可靠，它们之间也会发生任意的偏移。因此，依赖处理器时钟也许会导致错误的决策。

关于这些问题的一个重要结果是，在实际情况中，很难判断一个进程是崩溃了还是某些因素导致了延时。
没有收到一个进程发送的消息，可能是该进程已经崩溃，或是最新消息发生了网络延迟，或是其他情况导致进程延迟，或者是进程时钟发生了偏移。
无法确定一个被称为异步（asynchronous）的系统中的这些区别。

ZooKeeper的精确设计简化了这些问题的处理，ZooKeeper并不是完全消除这些问题，而是将这些问题在应用服务层面上完全透明化，使得这些问题更容易处理。
ZooKeeper实现了重要的分布式计算问题的解决方案，直观为开发人员提供某种程度上实现的封装。

### 主-从应用

要实现主-从模式的系统，必须解决以下三个关键问题：

* 主节点崩溃
	* 如果主节点发送错误并失效，系统将无法分配新的任务或重新分配已失败的任务。
* 从节点崩溃
	* 如果从节点崩溃，已分配的任务将无法完成。
* 通信故障
	* 如果主节点和从节点之间无法进行信息交换，从节点将无法得知新任务分配给它。

为了处理这些问题，之前的主节点出现问题时，系统需要可靠地选举一个新的主节点，判断哪些从节点有效，并判定一个从节点的状态相对于系统其他部分是否失效。

#### 主节点失效

主节点失效时，需要有一个备份主节点（backup master）。
当主要主节点（primary master）崩溃时，备份主节点接管主要主节点的角色，进行故障转移，然而，这并不是简单开始处理进入主节点的请求。
新的主要主节点需要能够恢复到旧的主要主节点崩溃时的状态。对于主节点状态的可恢复性，不能依靠从已经崩溃的主节点来获取这些信息，需要通过ZooKeeper来获取。

假如主节点有效，备份主节点却认为主节点已经崩溃。

这种错误的假设可能发生在以下情况:

例如主节点负载很高，导致消息任意延迟，备份主节点将会接管成为主节点的角色，执行所有必需的程序，最终可能以主节点的角色开始执行，成为第二个主要主节点。
更糟的是，如果一些从节点无法与主要主节点通信，如由于网络分区（network partition）错误导致，这些从节点可能会停止与主要主节点的通信，而与第二个主要主节点建立主-从关系。

针对这个场景中导致的问题，一般称之为脑裂（split-brain）：系统中两个或者多个部分开始独立工作，导致整体行为不一致性。

需要找出一种方法来处理主节点失效的情况，关键是需要避免发生脑裂的情况。

#### 从节点失效

客户端向主节点提交任务，之后主节点将任务派发到有效的从节点中。从节点接收到派发的任务，执行完这些任务后会向主节点报告执行状态。主节点下一步会将执行结果通知给客户端。

如果从节点崩溃了，所有已派发给这个从节点且尚未完成的任务需要重新派发。其中首要需求是让主节点具有检测从节点的崩溃的能力。
主节点必须能够检测到从节点的崩溃，并确定哪些从节点是否有效以便派发崩溃节点的任务。

一个从节点崩溃时，从节点也许执行了部分任务，也许全部执行完，但没有报告结果。如果整个运算过程产生了其他作用，还有必要执行某些恢复过程来清除之前的状态。

#### 通信故障

如果一个从节点与主节点的网络连接断开，比如网络分区（network partition）导致，重新分配一个任务可能会导致两个从节点执行相同的任务。

如果一个任务允许多次执行，在进行任务再分配时可以不用验证第一个从节点是否完成了该任务。如果一个任务不允许，那么的应用需要适应多个从节点执行相同任务的可能性。

通信故障导致的另一个重要问题是对锁等同步原语的影响。因为节点可能崩溃，而系统也可能网络分区（network partition），锁机制也会阻止任务的继续执行。

因此ZooKeeper也需要实现处理这些情况的机制。

* 首先，客户端可以告诉ZooKeeper某些数据的状态是临时状态（ephemeral）；
* 其次，同时ZooKeeper需要客户端定时发送是否存活的通知，如果一个客户端未能及时发送通知，那么所有从属于这个客户端的临时状态的数据将全部被删除。

通过这两个机制，在崩溃或通信故障发生时，就可以预防客户端独立运行而发生的应用宕机。

#### 任务总结

根据之前描述的这些，可以得到以下主-从架构的需求：

* 主节点选举
	* 这是关键的一步，使得主节点可以给从节点分配任务。
* 崩溃检测
	* 主节点必须具有检测从节点崩溃或失去连接的能力。
* 组成员关系管理
	* 主节点必须具有知道哪一个从节点可以执行任务的能力。
* 元数据管理
	* 主节点和从节点必须具有通过某种可靠的方式来保存分配状态和执行状态的能力。

理想的方式是，以上每一个任务都需要通过原语的方式暴露给应用，对开发者完全隐藏实现细节。
ZooKeeper提供了实现这些原语的关键机制，因此，开发者可以通过这些实现一个最适合他们需求、更加关注应用逻辑的分布式应用。

### 分布式协作的难点

假设有一个分布式的配置信息发生了改变，这个配置信息简单到仅仅只有一个比特位（bit），一旦所有运行中的进程对配置位的值达成一致，应用中的进程就可以启动。

这个例子原本是一个在分布式计算领域非常著名的定律，被称为FLP（由其作者命名：Fischer，Lynch，Patterson），这个结论证明了在异步通信的分布式系统中，进程崩溃，所有进程可能无法在这个比特位的配置上达成一致。

类似的定律称为CAP，表示一致性（Consistency）、可用性（Availability）和分区容错性（Partition-tolerance），该定律指出，当设计一个分布式系统时，希望这三种属性全部满足，但没有系统可以同时满足这三种属性。
因此ZooKeeper的设计尽可能满足一致性和可用性，当然，在发生网络分区时ZooKeeper也提供了只读能力。

### ZooKeeper的成功和注意事项

完美的解决方案是不存在的，ZooKeeper无法解决分布式应用开发者面对的所有问题，而是为开发者提供了一个优雅的框架来处理这些问题。

多年以来，ZooKeeper在分布式计算领域进行了大量的工作。
Paxos算法和虚拟同步技术（virtual synchrony）给ZooKeeper的设计带来了很大影响，通过这些技术可以无缝地处理所发生的某些变化或情况，并提供给开发者一个框架，来应对无法自动处理的某些情况。

在使用ZooKeeper时，有些情况ZooKeeper自身无法进行决策而是需要开发者自己做出决策。

## ZooKeeper基础

很多用于协作的原语常常在很多应用之间共享，因此，设计一个用于协作需求的服务的方法往往是提供原语列表，暴露出每个原语的实例化调用方法，并直接控制这些实例。
比如，可以说分布式锁机制组成了一个重要的原语，同时暴露出创建（create）、获取（acquire）和释放（release）三个调用方法。

这种设计存在一些重大的缺陷：

* 首先，要么预先提出一份详尽的原语列表，要么提供API的扩展，以便引入新的原语；
* 其次，以这种方式实现原语的服务使得应用丧失了灵活性。

ZooKeeper并不直接暴露原语，取而代之，它暴露了由一小部分调用方法组成的类似文件系统的API，以便允许应用实现自己的原语。

通常使用菜谱（recipes）来表示这些原语的实现。菜谱包括ZooKeeper操作和维护一个小型的数据节点，这些节点被称为znode，采用类似于文件系统的层级树状结构进行管理。

![ZooKeeper数据树结构示例](/static/img/2018-08-06-ZooKeeper/2018-08-06-11-24-16.png)

* /workers节点作为父节点，其下每个znode子节点保存了系统中一个可用从节点信息。有一个从节点（foot.com：2181）。
* /tasks节点作为父节点，其下每个znode子节点保存了所有已经创建并等待从节点执行的任务的信息，主-从模式的应用的客户端在/tasks下添加一个znode子节点，用来表示一个新任务，并等待任务状态的znode节点。
* /assign节点作为父节点，其下每个znode子节点保存了分配到某个从节点的一个任务信息，当主节点为某个从节点分配了一个任务，就会在/assign下增加一个子节点。

### API概述

znode节点可能含有数据，也可能没有。如果一个znode节点包含任何数据，那么数据存储为字节数组（byte array）。

字节数组的具体格式特定于每个应用的实现，ZooKeeper并不直接提供解析的支持。
可以使用如Protocol Buffers、Thrift、Avro或MessagePack等序列化（Serialization）包来方便地处理保存于znode节点的数据格式，不过有些时候，以UTF-8或ASCII编码的字符串已经够用了。

ZooKeeper的API暴露了以下方法：

* create /path data
	* 创建一个名为/path的znode节点，并包含数据data。
* delete /path
	* 删除名为/path的znode。
* exists /path
	* 检查是否存在名为/path的节点。
* setData /path data
	* 设置名为/path的znode的数据为data。
* getData /path
	* 返回名为/path节点的数据信息。
* getChildren /path
	* 返回所有/path节点的所有子节点列表。

### znode的不同类型

当新建znode时，还需要指定该节点的类型（mode），不同的类型决定了znode节点的行为方式。

znode一共有4种类型：持久的（persistent）、临时的（ephemeral）、持久有序的（persistent_sequential）和临时有序的（ephemeral_sequential）。

#### 持久节点和临时节点

znode节点可以是持久（persistent）节点，还可以是临时（ephemeral）节点。

* 持久的znode，如/path，只能通过调用delete来进行删除。
* 临时的znode与之相反，当创建该节点的客户端崩溃或关闭了与ZooKeeper的连接时，这个节点就会被删除。

一个临时znode，在以下两种情况下将会被删除：

* 当创建该znode的客户端的会话因超时或主动关闭而中止时。
* 当某个客户端（不一定是创建者）主动删除该节点时。

因为临时的znode在其创建者的会话过期时被删除，所以现在不允许临时节点拥有子节点。

#### 有序节点

一个znode还可以设置为有序（sequential）节点。一个有序znode节点被分配唯一个单调递增的整数。当创建有序节点时，一个序号会被追加到路径之后。

有序znode通过提供了创建具有唯一名称的znode的简单方式。同时也通过这种方式可以直观地查看znode的创建顺序。

### 监视与通知

ZooKeeper通常以远程服务的方式被访问，如果每次访问znode时，客户端都需要获得节点中的内容，这样的代价就非常大。因为这样会导致更高的延迟，而且ZooKeeper需要做更多的操作。

![同一个znode的多次读取](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-07-35.png)

这是一个常见的轮询问题。为了替换客户端的轮询，选择了基于通知（notification）的机制：

客户端向ZooKeeper注册需要接收通知的znode，通过对znode设置监视点（watch）来接收通知。
监视点是一个单次触发的操作，意即监视点会触发一个通知。为了接收多个通知，客户端必须在每次通知后设置一个新的监视点。

当节点/tasks发生变化时，客户端会收到一个通知，并从ZooKeeper读取一个新值。

![使用通知机制来获悉znode的变化](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-09-19.png)

当使用通知机制时，还有一些需要知道的事情。因为通知机制是单次触发的操作，所以在客户端接收一个znode变更通知并设置新的监视点时，znode节点也许发生了新的变化（不要担心，你不会错过状态的变化）。

1. 客户端c1设置监视点来监控/tasks数据的变化。
2. 客户端c1连接后，向/tasks中添加了一个新的任务。
3. 客户端c1接收通知。
4. 客户端c1设置新的监视点，在设置完成前，第三个客户端c3连接后，向/tasks中添加了一个新的任务。

客户端c1最终设置了新的监视点，但由c3添加数据的变更并没有触发一个通知。
为了观察这个变更，在设置新的监视点前，c1实际上需要读取节点/tasks的状态，通过在设置监视点前读取ZooKeeper的状态，最终，c1就不会错过任何变更。

通知机制的一个重要保障是，对同一个znode的操作，先向客户端传送通知，然后再对该节点进行变更。如果客户端对一个znode设置了监视点，而该znode发生了两个连续更新。
第一次更新后，客户端在观察第二次变化前就接收到了通知，然后读取znode中的数据。
认为主要特性在于通知机制阻止了客户端所观察的更新顺序。虽然ZooKeeper的状态变化传播给某些客户端时更慢，但保障客户端以全局的顺序来观察ZooKeeper的状态。

ZooKeeper可以定义不同类型的通知，这依赖于设置监视点对应的通知类型。客户端可以设置多种监视点，如监控znode的数据变化、监控znode子节点的变化、监控znode的创建或删除。
为了设置监视点，可以使用任何API中的调用来读取ZooKeeper的状态，在调用这些API时，传入一个watcher对象或使用默认的watcher。

**谁来管理我的缓存**

> 如果不让客户端来管理其拥有的ZooKeeper数据的缓存，不得不让ZooKeeper来管理这些应用程序的缓存。但是，这样会导致ZooKeeper的设计更加复杂。
> 事实上，如果让ZooKeeper管理缓存失效，可能会导致ZooKeeper在运行时，停滞在等待客户端确认一个缓存失效的请求上，因为在进行所有的写操作前，需要确认所有的缓存数据是否已经失效。

### 版本

每一个znode都有一个版本号，它随着每次数据变化而自增。两个API操作可以有条件地执行：setData和delete。
这两个调用以版本号作为转入参数，只有当转入参数的版本号与服务器上的版本号一致时调用才会成功。
当多个ZooKeeper客户端对同一个znode进行操作时，版本的使用就会显得尤为重要。

![使用版本来阻止并行操作的不一致性](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-20-01.png)

## ZooKeeper架构

ZooKeeper服务器端运行于两种模式下：独立模式（standalone）和仲裁模式（quorum）。

* 独立模式几乎与其术语所描述的一样：有一个单独的服务器，ZooKeeper状态无法复制。
* 在仲裁模式下，具有一组ZooKeeper服务器，称为ZooKeeper集合（ZooKeeper ensemble），它们之前可以进行状态的复制，并同时为服务于客户端的请求。

从这个角度出发，使用术语“ZooKeeper集合”来表示一个服务器设施，这一设施可以由独立模式的一个服务器组成，也可以仲裁模式下的多个服务器组成。

![ZooKeeper架构总览](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-24-16.png)

### ZooKeeper仲裁

在仲裁模式下，ZooKeeper复制集群中的所有服务器的数据树。但如果让一个客户端等待每个服务器完成数据保存后再继续，延迟问题将无法接受。

在公共管理领域，法定人数是指进行一项投票所需的立法者的最小数量。而在ZooKeeper中，则是指为了使ZooKeeper工作必须有效运行的服务器的最小数量。
这个数字也是服务器告知客户端安全保存数据前，需要保存客户端数据的服务器的最小个数。

例如，一共有5个ZooKeeper服务器，但法定人数为3个，这样，只要任何3个服务器保存了数据，客户端就可以继续，而其他两个服务器最终也将捕获到数据，并保存数据。

选择法定人数准确的大小是一个非常重要的事。法定人数的数量需要保证不管系统发生延迟或崩溃，服务主动确认的任何更新请求需要保持下去，直到另一个请求代替它。

通过使用多数方案，就可以容许f个服务器的崩溃，在这里，f为小于集合中服务器数量的一半。

如果有5个服务器，可以容许最多f=2个崩溃。在集合中，服务器的个数并不是必须为奇数，只是使用偶数会使得系统更加脆弱。
假设在集合中使用4个服务器，那么多数原则对应的数量为3个服务器。然而，这个系统仅能容许1个服务器崩溃，因为两个服务器崩溃就会导致系统失去多数原则的状态。
因此，在4个服务器的情况下，仅能容许一个服务器崩溃，而法定人数现在却更大，这意味着对每个请求，需要更多的确认操作。底线是需要争取奇数个服务器。

### 会话

会话的概念非常重要，对ZooKeeper的运行也非常关键。客户端提交给ZooKeeper的所有操作均关联在一个会话上。当一个会话因某种原因而中止时，在这个会话期间创建的临时节点将会消失。

当客户端通过某一个特定语言套件来创建一个ZooKeeper句柄时，它就会通过服务建立一个会话。客户端初始连接到集合中某一个服务器或一个独立的服务器。
客户端通过TCP协议与服务器进行连接并通信，但当会话无法与当前连接的服务器继续通信时，会话就可能转移到另一个服务器上。ZooKeeper客户端库透明地转移一个会话到不同的服务器。

会话提供了顺序保障，这就意味着同一个会话中的请求会以FIFO（先进先出）顺序执行。通常，一个客户端只打开一个会话，因此客户端请求将全部以FIFO顺序执行。
如果客户端拥有多个并发的会话，FIFO顺序在多个会话之间未必能够保持。而即使一个客户端中连贯的会话并不重叠，也未必能够保证FIFO顺序。

* 客户端建立了一个会话，并通过两个连续的异步调用来创建/tasks和/workers。
* 第一个会话过期。
* 客户端创建另一个会话，并通过异步调用创建/assign。

在这个调用顺序中，可能只有/tasks和/assign成功创建了，因为第一个会话保持了FIFO顺序，但在跨会话时就违反了FIFO顺序。

## 开始使用ZooKeeper

### 会话的状态和生命周期

会话的生命周期（lifetime）是指会话从创建到结束的时期，无论会话正常关闭还是因超时而导致过期。

一个会话的主要可能状态大多是简单明了的：CONNECTING、CONNECTED、CLOSED和NOT_CONNECTED。
状态的转换依赖于发生在客户端与服务之间的各种事件。

状态及状态的转换：

![状态及状态的转换](/static/img/2018-08-06-ZooKeeper/2018-08-06-17-59-40.png)

* 一个会话从NOT_CONNECTED状态开始，当ZooKeeper客户端初始化后转换到CONNECTING状态（箭头1）。
* 正常情况下，成功与ZooKeeper服务器建立连接后，会话转换到CONNECTED状态（箭头2）。
* 当客户端与ZooKeeper服务器断开连接或者无法收到服务器的响应时，它就会转换回CONNECTING状态（箭头3）并尝试发现其他ZooKeeper服务器。
* 如果可以发现另一个服务器或重连到原来的服务器，当服务器确认会话有效后，状态又会转换回CONNECTED状态。否则，它将会声明会话过期，然后转换到CLOSED状态（箭头4）。
* 应用也可以显式地关闭会话（箭头4和箭头5）。

**发生网络分区时等待CONNECTING**

> 如果一个客户端与服务器因超时而断开连接，客户端仍然保持CONNECTING状态。  
> 如果因网络分区问题导致客户端与ZooKeeper集合被隔离而发生连接断开，那么其状态将会一直保持，
> 直到显式地关闭这个会话，或者分区问题修复后，客户端能够获悉ZooKeeper服务器发送的会话已经过期。
> 发生这种行为是因为ZooKeeper集合对声明会话超时负责，而不是客户端负责。  
> 直到客户端获悉ZooKeeper会话过期，否则客户端不能声明自己的会话过期。然而，客户端可以选择关闭会话。

**客户端会尝试连接哪一个服务器？**

> 在仲裁模式下，客户端有多个服务器可以连接，而在独立模式下，客户端只能尝试重新连接单个服务器。
> 在仲裁模式中，应用需要传递可用的服务器列表给客户端，告知客户端可以连接的服务器信息并选择一个进行连接。

创建一个会话时，你需要设置会话超时这个重要的参数，这个参数设置了ZooKeeper服务允许会话被声明为超时之前存在的时间。
如果经过时间t之后服务接收不到这个会话的任何消息，服务就会声明会话过期。

而在客户端侧，如果经过t/3的时间未收到任何消息，客户端将向服务器发送心跳消息。在经过2t/3时间后，ZooKeeper客户端开始寻找其他的服务器，而此时它还有t/3时间去寻找。

当尝试连接到一个不同的服务器时，非常重要的是，这个服务器的ZooKeeper状态要与最后连接的服务器的ZooKeeper状态保持最新。

客户端不能连接到这样的服务器：它未发现更新而客户端却已经发现的更新。ZooKeeper通过在服务中排序更新操作来决定状态是否最新。
ZooKeeper确保每一个变化相对于所有其他已执行的更新是完全有序的。因此，如果一个客户端在位置i观察到一个更新，它就不能连接到只观察到`i'<i`的服务器上。
在ZooKeeper实现中，系统根据每一个更新建立的顺序来分配给事务标识符。

在重连情况下事务标识符（zkid）的使用:

![客户端重连的例子](/static/img/2018-08-06-ZooKeeper/2018-08-06-18-09-22.png)

当客户端因超时与s1断开连接后，客户端开始尝试连接s2，但s2延迟于客户端所知的变化。然而，s3对这个变化的情况与客户端保持一致，所以s3可以安全连接。

### ZooKeeper与仲裁模式

**简单的负载均衡**

> 客户端以随机顺序连接到连接串中的服务器。这样可以用ZooKeeper来实现一个简单的负载均衡。不过，客户端无法指定优先选择的服务器来进行连接。

例如，如果有5个ZooKeeper服务器的一个集合，其中3个在美国西海岸，另外两个在美国东海岸，为了确保客户端只连接到本地服务器上，
可以使在东海岸客户端的连接串中只出现东海岸的服务器，在西海岸客户端的连接串中只有西海岸的服务器。

```shell
/{PATH_TO_ZK}/bin/zkCli.sh -server 127.0.0.1:2181,127.0.0.1:2182,127.0.0.1:2183
```

### 通过ZooKeeper实现锁

创建临时节点/lock，方式进程崩溃而无法解锁。其它进程因为存在创建失败而监听/lock的变化，检测到删除时再次尝试建立节点来获得锁。

## 使用ZooKeeper进行开发

### 建立ZooKeeper会话

ZooKeeper的API围绕ZooKeeper的句柄（handle）而构建，每个API调用都需要传递这个句柄。这个句柄代表与ZooKeeper之间的一个会话。

与ZooKeeper服务器已经建立的一个会话如果断开，这个会话就会迁移到另一台ZooKeeper服务器上。
只要会话还存活着，这个句柄就仍然有效，ZooKeeper客户端库会持续保持这个活跃连接，以保证与ZooKeeper服务器之间的会话存活。
如果句柄关闭，ZooKeeper客户端库会告知ZooKeeper服务器终止这个会话。如果ZooKeeper发现客户端已经死掉，就会使这个会话无效。
如果客户端之后尝试重新连接到ZooKeeper服务器，使用之前无效会话对应的那个句柄进行连接，那么ZooKeeper服务器会通知客户端库，这个会话已失效，使用这个句柄进行的任何操作都会返回错误。

会话在两个服务器之间发生迁移：

![会话在两个服务器之间发生迁移](/static/img/2018-08-06-ZooKeeper/2018-08-06-21-25-41.png)

```java
ZooKeeper(
    String connectString,
    int sessionTimeout,
    Watcher watcher)
```

* connectString
	* 包含主机名和ZooKeeper服务器的端口。
* sessionTimeout
	* 以毫秒为单位，表示ZooKeeper等待客户端通信的最长时间，之后会声明会话已死亡。
	* ZooKeeper会话一般设置超时时间为5~10秒。
* watcher
	* 用于接收会话事件的一个对象，这个对象需要自己创建。
	* Wacher定义为接口，所以需要自己实现一个类，然后初始化这个类的实例并传入ZooKeeper的构造函数中。
		* 客户端使用Watcher接口来监控与ZooKeeper之间会话的健康情况。
		* 与ZooKeeper服务器之间建立或失去连接时就会产生事件。
		* 它们同样还能用于监控ZooKeeper数据的变化。
		* 最终，如果与ZooKeeper的会话过期，也会通过Watcher接口传递事件来通知客户端的应用。

**ZooKeeper管理连接**

> 请不要自己试着去管理ZooKeeper客户端连接。
> ZooKeeper客户端库会监控与服务之间的连接，客户端库不仅告诉连接发生问题，还会主动尝试重新建立通信。
> 一般客户端开发库会很快重建会话，以便最小化应用的影响。所以不要关闭会话后再启动一个新的会话，这样会增加系统负载，并导致更长时间的中断。

#### 实现一个Watcher

```java
public class Master implements Watcher, Closeable {
	private ZooKeeper zk;
    private String hostPort;
	Master(String hostPort) { 
        this.hostPort = hostPort;
    }
	void startZK() throws IOException {
        zk = new ZooKeeper(hostPort, 15000, this);
    }
    void stopZK() throws InterruptedException, IOException {
        zk.close();
    }
	@Override
    public void process(WatchedEvent e) {
        System.out.println(e);
    }
}
```

```java
Master m = new Master(args[0]);
m.startZK();
Thread.sleep(10000);
// 主动关闭，否则要等到超时关闭
m.stopZK();
```

### 获取管理权

create方法会抛出两种异常：KeeperException和InterruptedException。

```java
private String serverId = Integer.toHexString(random.nextInt());
boolean isLeader = false;
public void runForMasterWithExceptionCaught() throws InterruptedException{
	while (true) {
		try {
			zk.create("/master",
					serverId.getBytes(),
					Ids.OPEN_ACL_UNSAFE,
					CreateMode.EPHEMERAL
			);
			isLeader = true;
			break;
		} catch (KeeperException.NodeExistsException e) {
			// 已被申请master
			isLeader = false;
			break;
		} catch (KeeperException ignored) {
		}
		if (checkIsLeader()) {
			break;
		}
	}
}

当处理ConnectionLossException异常时，需要找出那个进程创建的/master节点，如果进程是自己，就开始成为群首角色。通过getData方法来处理：

```java
byte[] getData(
    String path,
    bool watch,
    Stat stat)
```

* path
	* 类似其他ZooKeeper方法一样，第一个参数为想要获取数据的znode节点路径。
* watch
	* 表示是否想要监听后续的数据变更。
		* 如果设置为true，就可以通过创建ZooKeeper句柄时所设置的Watcher对象得到事件，同时另一个版本的方法提供了以Watcher对象为入参，通过这个传入的对象来接收变更的事件。
* stat
	* 最后一个参数类型Stat结构，getData方法会填充znode节点的元数据信息。
* 返回值
	* 方法返回成功（没有抛出异常），就会得到znode节点数据的字节数组。

```java
boolean checkIsLeader() {
	while (true) {
		try {
			Stat stat = new Stat();
			// 获取数据判断
			byte data[] = zk.getData("/master", false, stat);
			isLeader = new String(data).equals(serverId);
			return true;
		} catch (KeeperException.NoNodeException e) {
			// create again
			return false;
		} catch (InterruptedException | KeeperException ignored) {
		}
	}
}
```

需要确保处理了这两种异常，特别是ConnectionLossException（KeeperException异常的子类）和InterruptedException。
对于其他异常，可以忽略并继续执行，但对于这两种异常，create方法可能已经成功了，所以如果作为主节点就需要捕获并处理它们。

ConnectionLossException异常发生于客户端与ZooKeeper服务端失去连接时。一般常常由于网络原因导致，如网络分区或ZooKeeper服务器故障。
当这个异常发生时，客户端并不知道是在ZooKeeper服务器处理前丢失了请求消息，还是在处理后客户端未收到响应消息。
ZooKeeper的客户端库将会为后续请求重新建立连接，但进程必须知道一个未决请求是否已经处理了还是需要再次发送请求。

InterruptedException异常源于客户端线程调用了Thread.interrupt，通常这是因为应用程序部分关闭，但还在被其他相关应用的方法使用。
进程会中断本地客户端的请求处理的过程，并使该请求处于未知状态。

这两种请求都会导致正常请求处理过程的中断，开发者不能假设处理过程中的请求的状态。当处理这些异常时，开发者在处理前必须知道系统的状态。
如果发生群首选举，在没有确认情况之前，不希望确定主节点。如果create执行成功了，活动主节点死掉以前，没有任何进程能够成为主节点，如果活动主节点还不知道自己已经获得了管理权，不会有任何进程成为主节点进程。

在这个例子中，简单地传递InterruptedException给调用者，即向上传递异常。

InterruptedException异常的处理依赖于程序的上下文环境，如果向上抛出InterruptedException异常，最终关闭zk句柄，可以抛出异常到调用栈顶，当句柄关闭时就可以清理所有一切。
如果zk句柄未关闭，在重新抛出异常前，需要弄清楚自己是不是主节点，或者继续异步执行后续操作。后者情况非常棘手，需要仔细设计并妥善处理。

#### 异步获取管理权

ZooKeeper中，所有同步调用方法都有对应的异步调用方法。通过异步调用，可以在单线程中同时进行多个调用，同时也可以简化的实现方式。

```java
void create(String path,
    byte[] data,
    List<ACL> acl,
    CreateMode createMode,
	// 回调方法
    AsyncCallback.StringCallback cb,
	// 上下文，回调方法调用是传入的对象实例
    Object ctx)
```

该方法调用后通常在create请求发送到服务端之前就会立即返回。
回调对象通过传入的上下文参数来获取数据，当从服务器接收到create请求的结果时，上下文参数就会通过回调对象提供给应用程序。

_注意，该create方法不会抛出异常，可以简化处理，因为调用返回前并不会等待create命令完成，所以无需关心_

异步方法调用会简单化队列对ZooKeeper服务器的请求，并在另一个线程中传输请求。当接收到响应信息，这些请求就会在一个专用回调线程中被处理。
为了保持顺序，只会有一个单独的线程按照接收顺序处理响应包。

```java
interface StringCallback extends AsyncCallback {
    public void processResult(int rc, String path, Object ctx, String name);
```

* rc
	* 返回调用的结构，返回OK或与KeeperException异常对应的编码值。
* path
	* 传给create的path参数值。
* ctx
	* 传给create的上下文参数。
* name
	* 创建的znode节点名称。
	* 目前，调用成功后，path和name的值一样，但是，如果采用CreateMode.SEQUENTIAL模式，这两个参数值就不会相等。

**回调函数处理**

> 因为只有一个单独的线程处理所有回调调用，如果回调函数阻塞，所有后续回调调用都会被阻塞，也就是说，一般不要在回调函数中集中操作或阻塞操作。
> 有时，在回调函数中调用同步方法是合法的，但一般还是避免这样做，以便后续回调调用可以快速被处理。

```java
public void runForMaster() {
	LOG.info("Running for master");
	zk.create("/master",
			serverId.getBytes(),
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.EPHEMERAL,
			masterCreateCallback,
			null
	);
}
StringCallback masterCreateCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				checkMaster();
				break;
			case OK:
				isLeader = true;
				break;
			default:
				isLeader = false;
		}
		LOG.info("I'm " + (state == MasterStates.ELECTED ? "" : "not ") + "the leader " + serverId);
	}
};

DataCallback masterCheckCallback = new DataCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, byte[] data, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				checkMaster();
				break;
			case NONODE:
				runForMaster();
				break;
		}
	}
};
void checkMaster() {
	zk.getData("/master", false, masterCheckCallback, null);
}
```

#### 设置元数据

```java
public void bootstrap() {
	createParent("/workers", new byte[0]);
	createParent("/assign", new byte[0]);
	createParent("/tasks", new byte[0]);
	createParent("/status", new byte[0]);
}
void createParent(String path, byte[] data) {
	zk.create(path,
			data,
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.PERSISTENT,
			createParentCallback,
			data);
}
StringCallback createParentCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 重试
				createParent(path, (byte[]) ctx);
				break;
			case OK:
				LOG.info("Parent created");
				break;
			case NODEEXISTS:
				LOG.warn("Parent already registered: " + path);
				break;
			default:
				LOG.error("Something went wrong: ", KeeperException.create(Code.get(rc), path));
		}
	}
};
```

### 注册从节点

```java
public class Worker implements Watcher, Closeable {
	private ZooKeeper zk;
	private String hostPort;
	private String serverId = Integer.toHexString((new Random()).nextInt());
	String name;
	public void register() {
		name = "worker-" + serverId;
		zk.create("/workers/" + name,
			"Idle".getBytes(),
			Ids.OPEN_ACL_UNSAFE,
			// 临时节点
			CreateMode.EPHEMERAL,
			createWorkerCallback, null);
	}
	StringCallback createWorkerCallback = new StringCallback() {
		@Override
		public void processResult(int rc, String path, Object ctx, String name) {
			switch (Code.get(rc)) {
				case CONNECTIONLOSS:
					// 重试
					register();
					break;
				case OK:
					LOG.info("Registered successfully: " + serverId);
					break;
				case NODEEXISTS:
					LOG.warn("Already registered: " + serverId);
					break;
				default:
					LOG.error("Something went wrong: ", KeeperException.create(Code.get(rc), path));
			}
		}
	};
	StatCallback statusUpdateCallback = new StatCallback() {
		public void processResult(int rc, String path, Object ctx, Stat stat) {
			switch (Code.get(rc)) {
				case CONNECTIONLOSS:
					// 重试
					updateStatus((String) ctx);
					return;
			}
		}
	};
	String status;
	synchronized private void updateStatus(String status) {
		// 竟态条件检查，因为这里的callback存在顺序问题，所以要检查是否重试
		if (status == this.status) {
			// 第三个参数-1表示进制版本号检查，通过上下文传递status
			zk.setData("/workers/" + name, status.getBytes(), -1,
				statusUpdateCallback, status);
		}
	}
	public void setStatus(String status) {
		// 记录当前状态，重试检查时使用
		this.status = status;
		updateStatus(status);
	}
}
```

理解连接丢失时补发操作的问题，考虑以下场景：

1. 从节点开始执行任务task-1，因此设置其状态为working on task-1。
2. 客户端库尝试通过setData来实现，但此时遇到了网络问题。
3. 客户端库确定与ZooKeeper的连接已经丢失，同时在statusUpdateCallback调用前，从节点完成了任务task-1并处于空闲状态。
4. 从节点调用客户端库，使用setData方法置状态为Idle。
5. 之后客户端处理连接丢失的事件，如果updateStatus方法未检查当前状态，setData调用还是会设置状态为working on task-1。
6. 当与ZooKeeper连接重新建立时，客户端库会按顺序如实地调用这两个setData操作，这就意味着最终状态为working on task-1。

在updateStatus方法中，在补发setData之前，先检查当前状态，这样·就可以避免以上场景。

**顺序和ConnectionLossException异常**

> ZooKeeper会严格地维护执行顺序，并提供了强有力的有序保障，然而，在多线程下还是需要小心面对顺序问题。
> 多线程下，当回调函数中包括重试逻辑的代码时，一些常见的场景都可能导致错误发生。
> 当遇到ConnectionLossException异常而补发一个请求时，新建立的请求可能排序在其他线程中的请求之后，而实际上其他线程中的请求应该在原来请求之后。

### 任务队列化

使用有序节点，有两个好处：

* 第一，序列号指定了任务被队列化的顺序；
* 第二，可以通过很少的工作为任务创建基于序列号的唯一路径。

```java
public class Client implements Watcher, Closeable {
    private static final Logger LOG = LoggerFactory.getLogger(Master.class);
    ZooKeeper zk;
    String hostPort;
	Client(String hostPort) { 
        this.hostPort = hostPort;
    }
    String queueCommand(String command) throws KeeperException, InterruptedException {
        while (true) {
            try {
				// 后缀递增id的name，ZooKeeper确定顺序
                String name = zk.create("/task/task-",
                        command.getBytes(),
                        OPEN_ACL_UNSAFE,
                        CreateMode.EPHEMERAL_SEQUENTIAL);
                return name;
            } catch (KeeperException.ConnectionLossException ignore) {
            }
        }
	}
	public static void main(String args[]) throws Exception {
        Client c = new Client(args[0]);
        c.startZK();
		String name = c.queueCommand(args[1]);
		System.out.println("Created " + name);
		c.stopZK();
    }
}
```

如果在执行create时遇到连接丢失，需要重试create操作。因为多次执行创建操作，也许会为一个任务建立多个znode节点，对于大多数至少执行一次（execute-at-least-once）策略的应用程序，也没什么问题。
对于某些最多执行一次（execute-at-most-once）策略的应用程序，就需要多一些额外工作：

需要为每一个任务指定一个唯一的ID（如会话ID），并将其编码到znode节点名中，在遇到连接丢失的异常时，只有在/tasks下不存在以这个会话ID命名的节点时才重试命令。

### 管理客户端

```java
public class AdminClient implements Watcher {
    private ZooKeeper zooKeeper;
    private String hostPort;

    public AdminClient(String hostPort) {
        this.hostPort = hostPort;
    }

    public void start() throws IOException {
        zooKeeper = new ZooKeeper(hostPort, 15000, this);
    }

    public void stop() throws InterruptedException {
        zooKeeper.close();
    }

    @Override
    public void process(WatchedEvent event) {
        System.out.println(event);
    }
    public void listStat() throws KeeperException, InterruptedException {
        try {
            Stat stat = new Stat();
			final byte[] data = zooKeeper.getData("/master", false, stat);
			// 节点建立时的秒数
            Date startDate = new Date(stat.getCtime());
            System.out.println("Master: " + new String(data) + "since " + startDate);

        } catch (KeeperException.NoNodeException e) {
            System.out.println("No Master");
        }
        System.out.println("Workers:");
        for (String w : zooKeeper.getChildren("/workers", false)) {
            byte data[] = zooKeeper.getData("/workers/" + w, false, null);
            String state = new String(data);
            System.out.println("\t" + w + " " + state);
        }
        System.out.println("Tasks:");
        for (String t : zooKeeper.getChildren("/assign", false)) {
            String state = new String(t);
            System.out.println("\t" + t);
        }

    }
    public static void main(String[] args) throws Exception {
        AdminClient adminClient = new AdminClient(args[0]);
        adminClient.start();
        adminClient.listStat();
        adminClient.stop();
    }
}
```

### 总结

* 需要处理异常情况使得的代码非常复杂，尤其是ConnectionLossException异常，开发者需要检查系统状态并合理恢复（ZooKeeper用于协助管理分布式状态，提供了故障处理的框架，但遗憾的是，它并不能让故障消失）。
* 其次，适应异步API的开发非常有用，异步API提供了巨大的性能优势，简化了错误恢复工作。

## 处理状态变化

### 单次触发器

* 事件（event）表示一个znode节点执行了更新操作。
* 监视点（watch）表示一个与之关联的znode节点和事件类型组成的单次触发器（例如，znode节点的数据被赋值，或znode节点被删除）。
* 当一个监视点被一个事件触发时，就会产生一个通知（notification）。通知是注册了监视点的应用客户端收到的事件报告的消息。

当应用程序注册了一个监视点来接收通知，匹配该监视点条件的第一个事件会触发监视点的通知，并且最多只触发一次。

例如，当znode节点/z被删除，客户端需要知道该变化（例如，表示备份主节点），客户端在/z节点执行exists操作并设置监视点标志位，等待通知，客户端会以回调函数的形式收到通知。

客户端设置的每个监视点与会话关联，如果会话过期，等待中的监视点将会被删除。不过监视点可以跨越不同服务端的连接而保持。

例如，当一个ZooKeeper客户端与一个ZooKeeper服务端的连接断开后连接到集合中的另一个服务端，客户端会发送未触发的监视点列表，在注册监视点时，
服务端将要检查已监视的znode节点在之前注册监视点之后是否已经变化，如果znode节点已经发生变化，一个监视点的事件就会被发送给客户端，否则在新的服务端上注册监视点。

**单次触发是否会丢失事件**

答案是肯定的。

一个应用在接收到通知后，注册另一个监视点时，可能会丢失事件。
丢失事件通常并不是问题，因为任何在接收通知与注册新监视点之间的变化情况，均可以通过读取ZooKeeper的状态信息来获得。

实际上，将多个事件分摊到一个通知上具有积极的作用。应用进行高频率的更新操作时，这种通知机制比每个事件都发送通知更加轻量化。

举个例子，如果每个通知平均捕获两个事件，为每个事件只产生了0.5个通知，而不是每个事件1个通知。

### 如何设置监控点

ZooKeeper的API中的所有读操作：getData、getChildren和exists，均可以选择在读取的znode节点上设置监视点。

使用监视点机制，需要实现Watcher接口类，实现其中的process方法：

```java
public void process(WatchedEvent event);
```

WatchedEvent数据结构包括以下信息：

* ZooKeeper会话状态（KeeperState）：Disconnected、SyncConnected、AuthFailed、ConnectedReadOnly、SaslAuthenticated和Expired。
* 事件类型（EventType）：NodeCreated、NodeDeleted、NodeDataChanged、NodeChildrenChanged和None。
	* 前三个事件类型只涉及单个znode节点，第四个事件类型涉及监视的znode节点的子节点。
	* 使用None表示无事件发生，而是ZooKeeper的会话状态发生了变化。
* 如果事件类型不是None时，返回一个znode路径。

监视点有两种类型：数据监视点和子节点监视点。

* 创建、删除或设置一个znode节点的数据都会触发数据监视点，exists和getData这两个操作可以设置数据监视点。
* 只有getChildren操作可以设置子节点监视点，这种监视点只有在znode子节点创建或删除时才被触发。

对于每种事件类型，通过以下调用设置监视点：

* NodeCreated
	* 通过exists调用设置一个监视点。
* NodeDeleted
	* 通过exists或getData调用设置监视点。
* NodeDataChanged
	* 通过exists或getData调用设置监视点。
* NodeChildrenChanged
	* 通过getChildren调用设置监视点。

当创建一个ZooKeeper对象，需要传递一个默认的Watcher对象，ZooKeeper客户端使用这个监视点来通知应用ZooKeeper状态的变化情况，如会话状态的变化。

对于ZooKeeper节点的事件的通知，你可以使用默认的监视点，也可以单独实现一个。

```java
// 使用自定义watcher
public byte[] getData(final String path, Watcher watcher, Stat stat);
// 是否使用默认watcher
public byte[] getData(String path, boolean watch, Stat stat);
```

两个方法第一个参数均为znode节点，第一个方法传递一个新的Watcher对象
第二个方法则告诉客户端使用默认的监视点，只需要在调用时将第二个参数传递true。

stat入参为Stat类型的实例化对象，ZooKeeper使用该对象返回指定的path参数的znode节点信息。
Stat结构包括znode节点的属性信息，如该znode节点的上次更新（zxid）的时间戳，以及该znode节点的子节点数。

对于监视点的一个重要问题是，一旦设置监视点就无法移除。要想移除一个监视点，只有两个方法，一是触发这个监视点，二是使其会话被关闭或过期。
社区致力于在版本3.5.0中提供该功能。

**关于一些重载**

> 在ZooKeeper的会话状态和znode节点的变化事件中，使用了相同的监视机制来处理应用程序的相关事件的通知。
> 虽然会话状态的变化和znode状态的变化组成了两个独立的事件集合，为简单其见，使用了相同的机制传送这些事件。

### 普遍模型

ZooKeeper的应用中使用的通用代码的模型：

1. 进行调用异步。
2. 实现回调对象，并传入异步调用函数中。
3. 如果操作需要设置监视点，实现一个Watcher对象，并传入异步调用函数中。

```java
zk.exists("/myZnode",
          myWatcher,
          existsCallback,
          null);
Watcher myWatcher = new Watcher() {
    public void process(WatchedEvent e) {
        // Process the watch event
    }
}
StatCallback existsCallback = new StatCallback() {
    public void processResult(int rc, String path, Object ctx, Stat stat) {
        // Process the result of the exists call
    }
};
```

### 管理权变化

应用客户端通过创建/master节点来推选自己为主节点（称为“主节点竞选”），如果znode节点已经存在，应用客户端确认自己不是主要主节点并返回，
然而，这种实现方式无法容忍主要主节点的崩溃。如果主要主节点崩溃，备份主节点并不知道，因此需要在/master上设置监视点，在节点删除时（无论是显式关闭还是因为主要主节点的会话过期），ZooKeeper会通知客户端。

```java
// master创建回调
StringCallback masterCreateCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 检查master，来确实是否能够创建节点
				checkMaster();
				break;
			case OK:
				state = MasterStates.ELECTED;
				// OK就行使领导权
				takeLeadership();
				break;
			case NODEEXISTS:
				state = MasterStates.NOTELECTED;
				// 已经存在就监视节点变化 
				masterExists();
				break;
			default:
				state = MasterStates.NOTELECTED;
				LOG.error("Something went wrong when running for master.",
						KeeperException.create(Code.get(rc), path));
		}
		LOG.info("I'm " + (state == MasterStates.ELECTED ? "" : "not ") + "the leader " + serverId);
	}
};
void masterExists() {
	// exist监视
	zk.exists("/master",
			masterExistsWatcher,
			masterExistsCallback,
			null);
}
Watcher masterExistsWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeDeleted) {
			assert "/master".equals(e.getPath());
			// 获取master所有权
			runForMaster();
		}
	}
};
```



```java
StatCallback masterExistsCallback = new StatCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 失败重试
				masterExists();
				break;
			case OK:
				// 如果create回调和exist执行期间被删除，返回OK后判断stat是否为空
				// 因为无法保证监听点设置在节点删除之前
				if (stat == null) {
					state = MasterStates.RUNNING;
					// 尝试称为master
					runForMaster();
				}
				break;
			case NONODE:
				state = MasterStates.RUNNING;
				runForMaster();
				LOG.info("It sounds like the previous master is gone, " +
						"so let's run for master again.");
				break;
			default:
				// 其它情况检查/master节点做出判断
				// 如果是创建通知，则会通过masterCheckCallback的NONODE重新竞选
				checkMaster();
				break;
		}
	}
};
```

只要客户端程序运行中，且没有成为主要主节点，客户端竞选主节点并执行exists来设置监视点，这一模式就会一直运行下去。
如果客户端成为主要主节点，但却崩溃了，客户端重启还继续重新执行这些代码。

主节点竞选中可能的交错操作：

![主节点竞选中可能的交错操作](/static/img/2018-08-06-ZooKeeper/2018-08-08-21-31-11.png)

如果竞选主节点成功，create操作执行完成，应用客户端不需要做其他事情（图中a）。  
如果create操作失败，则意味着该节点已经存在，客户端就会执行exists操作来设置/master节点的监视点（图中b）。  
在竞选主节点和执行exists操作之间，也许/master节点已经删除了，这时，如果exists调用返回该节点依然存在，客户端只需要等待通知的到来，否则就需要再次尝试创建/master进行竞选主节点操作。
如果创建/master节点成功，监视点就会被触发，表示znode节点发生了变化（图中c），不过，这个通知没有什么意义，因为这是客户端自己引起的变化。  
如果再次执行create操作失败，就会通过执行exists设置监视点来重新执行这一流程（图中d）。

### 主节点等待从节点的变化

系统中任何时候都可能发生新的从节点加入进来，或旧的从节点退役的情况，从节点执行分配给它的任务前也许会崩溃。
为了确认某个时间点可用的从节点信息，通过在ZooKeeper中的/workers下添加子节点来注册新的从节点。
当一个从节点崩溃或从系统中被移除，如会话过期等情况，需要自动将对应的znode节点删除。优雅实现的从节点会显式地关闭其会话，而不需要ZooKeeper等待会话过期。

```java
Watcher workersChangeWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeChildrenChanged) {
			assert "/workers".equals(e.getPath());
			getWorkers();
		}
	}
};

void getWorkers() {
	zk.getChildren("/workers",
			workersChangeWatcher,
			workersGetChildrenCallback,
			null);
}

ChildrenCallback workersGetChildrenCallback = new ChildrenCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, List<String> children) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 重新获取并监视
				getWorkers();
				break;
			case OK:
				LOG.info("Succesfully got a list of workers: "
						+ children.size()
						+ " workers");
				// 重新分配崩溃节点任务，并重新设置从节点列表
				reassignAndSet(children);
				break;
			default:
				LOG.error("getChildren failed",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
// 本地缓存
protected ChildrenCache workersCache;

void reassignAndSet(List<String> children) {
	List<String> toProcess;

	if (workersCache == null) {
		// 第一次初始化
		workersCache = new ChildrenCache(children);
		toProcess = null;
	} else {
		LOG.info("Removing and setting");
		// 检查是否有节点被移除了
		toProcess = workersCache.removedAndSet(children);
	}
	// 重新分配任务
	if (toProcess != null) {
		for (String worker : toProcess) {
			getAbsentWorkerTasks(worker);
		}
	}
}
```

需要保存之前获得的信息，因此使用本地缓存。假设在第一次获得从节点列表后，当收到从节点列表更新的通知时，如果没有保存旧的信息，即使再次读取信息也不知道具体变化的信息是什么。
本例中的缓存类简单地保存主节点上次读取的列表信息，并实现检查变化信息的一些方法。

**基于CONNECTIONLOSS事件的监视**

> 监视点的操作执行成功后就会为一个znode节点设置一个监视点，如果ZooKeeper的操作因为客户端连接断开而失败，应用需要再次执行这些调用。

### 主节点等待新任务进行分配

与等待从节点列表变化类似，主要主节点等待添加到/tasks节点中的新任务。主节点首先获得当前的任务集，并设置变化情况的监视点。
在ZooKeeper中，/tasks的子节点表示任务集，每个子节点对应一个任务，一旦主节点获得还未分配的任务信息，主节点会随机选择一个从节点，将这个任务分配给从节点。

```java
Watcher tasksChangeWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeChildrenChanged) {
			assert "/tasks".equals(e.getPath());
			getTasks();
		}
	}
};

void getTasks() {
	zk.getChildren("/tasks",
			tasksChangeWatcher,
			tasksGetChildrenCallback,
			null);
}

ChildrenCallback tasksGetChildrenCallback = new ChildrenCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, List<String> children) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				getTasks();
				break;
			case OK:
				// List<String> toProcess;
				// if (tasksCache == null) {
				// 	tasksCache = new ChildrenCache(children);
				// 	toProcess = children;
				// } else {
				// 	toProcess = tasksCache.addedAndSet(children);
				// }
				// if (toProcess != null) {
				// 这里简化了设计，因为分配完会删除，所以拿到的都是未分配的
				if (children != null) {
					// 分配列表任务
					assignTasks(toProcess);
				}
				break;
			default:
				LOG.error("getChildren failed.",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
```

```java
void assignTasks(List<String> tasks) {
	for (String task : tasks) {
		getTaskData(task);
	}
}
void getTaskData(String task) {
	zk.getData("/tasks/" + task,
			false,
			taskDataCallback,
			task);
}

DataCallback taskDataCallback = new DataCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, byte[] data, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				getTaskData((String) ctx);
				break;
			case OK:
				/*
				 * Choose worker at random.
				 */
				List<String> list = workersCache.getList();
				String designatedWorker = list.get(random.nextInt(list.size()));
				/*
				 * Assign task to randomly chosen worker.
				 */
				String assignmentPath = "/assign/" + designatedWorker + "/" + (String) ctx;
				LOG.info("Assignment path: " + assignmentPath);
				// 分配任务
				createAssignment(assignmentPath, data);
				break;
			default:
				LOG.error("Error when trying to get task data.",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
```

```java
void createAssignment(String path, byte[] data) {
	// 创建分配节点
	zk.create(path,
			data,
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.PERSISTENT,
			assignTaskCallback,
			data);
}

StringCallback assignTaskCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				createAssignment(path, (byte[]) ctx);
				break;
			case OK:
				LOG.info("Task assigned correctly: " + name);
				// 删除/task下任务
				deleteTask(name.substring(name.lastIndexOf("/") + 1));
				break;
			case NODEEXISTS:
				LOG.warn("Task already assigned");
				break;
			default:
				LOG.error("Error when trying to assign task.",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
```

对于新任务，主节点选择一个从节点分配任务之后，主节点就会在/assign/work-id节点下创建一个新的znode节点，其中id为从节点标识符，之后主节点从任务列表中删除该任务节点。

当主节点为某个标识符为id的从节点创建任务分配节点时，假设从节点在任务分配节点（/assign/work-id）上注册了监视点，ZooKeeper会向从节点发送一个通知。

_注意，主节点在成功分配任务后，会删除/tasks节点下对应的任务。这种方式简化了主节点角色接收新任务并分配的设计，如果任务列表中混合的已分配和未分配的任务，主节点还需要区分这些任务。_

```java
void deleteTask(String name) {
	zk.delete("/tasks/" + name, -1, taskDeleteCallback, null);
}

VoidCallback taskDeleteCallback = new VoidCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				deleteTask(path);
				break;
			case OK:
				LOG.info("Successfully deleted " + path);
				break;
			case NONODE:
				LOG.info("Task has been deleted already");
				break;
			default:
				LOG.error("Something went wrong here, " + KeeperException.create(Code.get(rc), path));
		}
	}
};
```

### 从节点等待分配新任务

从节点第一步需要先向ZooKeeper注册自己。

```java
public void register() {
	name = "worker-" + serverId;
	zk.create("/workers/" + name,
			new byte[0],
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.EPHEMERAL,
			createWorkerCallback, null);
}

StringCallback createWorkerCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				/*
				 * Try again. Note that registering again is not a problem.
				 * If the znode has already been created, then we get a
				 * NODEEXISTS event back.
				 */
				register();
				break;
			case OK:
				LOG.info("Registered successfully: " + serverId);
				break;
			case NODEEXISTS:
				LOG.warn("Already registered: " + serverId);
				break;
			default:
				LOG.error("Something went wrong: ", KeeperException.create(Code.get(rc), path));
		}
	}
};
```

添加该znode节点会通知主节点，这个从节点的状态是活跃的，且已准备好处理任务。这里为了简化没有使用idle/busy状态

同样，还创建了/assign/work-id节点，这样，主节点可以为这个从节点分配任务。

如果在创建/assign/worker-id节点之前创建了/workers/worker-id节点，可能会陷入以下情况，主节点尝试分配任务，因分配节点的父节点还没有创建，导致主节点分配失败。
为了避免这种情况，需要先创建/assign/worker-id节点，而且从节点需要在/assign/worker-id节点上设置监视点来接收新任务分配的通知。

一旦有任务列表分配给从节点，从节点就会从/assign/worker-id获取任务信息并执行任务。

从节点从本地列表中获取每个任务的信息并验证任务是否还在待执行的队列中，从节点保存一个本地待执行任务的列表就是为了这个目的。

_注意，为了释放回调方法的线程，在单独的线程对从节点的已分配任务进行循环，否则，会阻塞其他的回调方法的执行。_

```java
Watcher newTaskWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeChildrenChanged) {
			assert new String("/assign/worker-" + serverId).equals(e.getPath());
			getTasks();
		}
	}
};

void getTasks() {
	zk.getChildren("/assign/worker-" + serverId,
			newTaskWatcher,
			tasksGetChildrenCallback,
			null);
}

protected ChildrenCache assignedTasksCache = new ChildrenCache();

ChildrenCallback tasksGetChildrenCallback = new ChildrenCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, List<String> children) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				getTasks();
				break;
			case OK:
				if (children != null) {
					// 单独线程中执行任务
					executor.execute(new Runnable() {
						List<String> children;
						DataCallback cb;
						/*
						 * Initializes input of anonymous class
						 */
						public Runnable init(List<String> children, DataCallback cb) {
							this.children = children;
							this.cb = cb;

							return this;
						}
						@Override
						public void run() {
							if (children == null) {
								return;
							}
							LOG.info("Looping into tasks");
							setStatus("Working");
							// 循环子节点列表
							for (String task : children) {
								LOG.trace("New task: {}", task);
								// 获得任务信息并执行
								zk.getData("/assign/worker-" + serverId + "/" + task,
										false,
										cb,
										task);
							}
						}
						// 这里获得未执行的任务，或者在for循环时判断未执行才获得并执行
					}.init(assignedTasksCache.addedAndSet(children), taskDataCallback));
				}
				break;
			default:
				System.out.println("getChildren failed: " + KeeperException.create(Code.get(rc), path));
		}
	}
};
```

**会话事件和监视点**

> 当与服务端的连接断开时（例如，服务端崩溃时），直到连接重新建立前，不会传送任何监视点。因此，会话事件CONNECTIONLOSS会发送给所有已知的监视点进行处理。
> 一般来说，应用使用会话事件进入安全模式：ZooKeeper客户端在失去连接后不会接收任何事件，因此客户端需要继续保持这种状态。
> 在主从应用的例子中，处理提交任务外，其他所有动作都是被动的，所以如果主节点或从节点发生连接断开时，不会触发任何动作。而且在连接断开时，主从应用中的客户端也无法提交新任务以及接收任务状态的通知。

### 客户端等待任务的执行结果

假设应用客户端已经提交了一个任务，现在客户端需要知道该任务何时被执行，以及任务状态。从节点执行执行一个任务时，会在/status下创建一个znode节点。

```java
void submitTask(String task, TaskObject taskCtx) {
	taskCtx.setTask(task);
	zk.create("/tasks/task-",
			task.getBytes(),
			OPEN_ACL_UNSAFE,
			CreateMode.PERSISTENT_SEQUENTIAL,
			createTaskCallback,
			taskCtx);// 传递了一个上下文Task类的实例
}

StringCallback createTaskCallback = new StringCallback() {
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				/*
				 * Handling connection loss for a sequential node is a bit
				 * delicate. Executing the ZooKeeper create command again
				 * might lead to duplicate tasks. For now, let's assume
				 * that it is ok to create a duplicate task.
				 */
				// 可能造成重复，暂时忽略
				submitTask(((TaskObject) ctx).getTask(), (TaskObject) ctx);
				break;
			case OK:
				LOG.info("My created task name: " + name);
				((TaskObject) ctx).setTaskName(name);
				// 设置监视点
				watchStatus(name.replace("/tasks/", "/status/"), ctx);
				break;
			default:
				LOG.error("Something went wrong" + KeeperException.create(Code.get(rc), path));
		}
	}
};
```

**有序节点是否创建成功？**

> 在创建有序节点时发生CONNECTIONLOSS事件，处理这种情况比较棘手，因为ZooKeeper每次分配一个序列号，对于连接断开的客户端，无法确认这个节点是否创建成功，
> 尤其是在其他客户端一同并发请求时（并发请求是指多个客户端进行相同的请求）。
> 为了解决这个问题，需要添加一些提示信息来标记这个znode节点的创建者，比如，在任务名称中加入服务器ID等信息，通过这个方法，就可以通过获取所有任务列表来确认任务是否添加成功。

检查状态节点是否已经存在（也许任务很快处理完成），并设置监视点。

```java
protected ConcurrentHashMap<String, Object> ctxMap = new ConcurrentHashMap<String, Object>();
void watchStatus(String path, Object ctx) {
	ctxMap.put(path, ctx);
	// 客户端通过该方法传递上下对象，当收到状态节点的通知时，就可以修改这个表示任务的对象
	zk.exists(path,
			statusWatcher,
			existsCallback,
			ctx);
}

Watcher statusWatcher = new Watcher() {
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeCreated) {
			assert e.getPath().contains("/status/task-");
			assert ctxMap.containsKey(e.getPath());
			zk.getData(e.getPath(),
					false,
					getDataCallback,
					ctxMap.get(e.getPath()));
		}
	}
};

StatCallback existsCallback = new StatCallback() {
	public void processResult(int rc, String path, Object ctx, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				watchStatus(path, ctx);
				break;
			case OK:
				if (stat != null) {
					// 状态节点已经存在，客户端获取这个节点
					zk.getData(path, false, getDataCallback, ctx);
					LOG.info("Status node is there: " + path);
				}
				break;
			case NONODE:
				// 状态节点不存在，不做任何事情
				break;
			default:
				LOG.error("Something went wrong when " +
						"checking if the status node exists: " +
						KeeperException.create(Code.get(rc), path));

				break;
		}
	}
};
```

### multiop

multiop可以原子性地执行多个ZooKeeper的操作，执行过程为原子性，即在multiop代码块中的所有操作要不全部成功，要不全部失败。

multiop特性：

1. 创建一个Op对象，该对象表示你想通过multiop方法执行的每个ZooKeeper操作，ZooKeeper提供了每个改变状态操作的Op对象的实现：create、delete和setData。
2. 通过Op对象中提供的一个静态方法调用进行操作。
3. 将Op对象添加到Java的Iterable类型对象中，如列表（List）。
4. 使用列表对象调用multi方法。

```java
// 为delete方法创建Op对象
Op deleteZnode(String z) {
	// 通过Op方法返回
	return Op.delete(z, -1);
}
...
// 以列表形式传入每个delete操作的元素执行multi方法
List<OpResult> results = zk.multi(Arrays.asList(deleteZnode("/a/b"),
									deleteZnode("/a"));
```

调用multi方法返回一个OpResult对象的列表，每个对象对应每个操作。
例如，对于delete操作，使用DeleteResult类，该类继承自OpResult，通过每种操作类型对应的结果对象暴露方法和数据。
DeleteResult对象仅提供了equals和hashCode方法，而CreateResult对象暴露出操作的路径（path）和Stat对象。对于错误处理，ZooKeeper返回一个包含错误码的ErrorResult类的实例。

multi方法同样也有异步版本。

```java
public List<OpResult> multi(Iterable<Op> ops) throws InterruptedException, KeeperException;
public void multi(Iterable<Op> ops, MultiCallback cb, Object ctx);
```

multiop可以简化不止一处的主从模式的实现，当分配一个任务，在之前的例子中，主节点会创建任务分配节点，然后删除/tasks下对应的任务节点。
如果在删除/tasks下的节点时，主节点崩溃，就会导致一个已分配的任务还在/tasks下。使用multiop，可以原子化创建任务分配节点和删除/tasks下对应的任务节点这两个操作。
使用这个方式，可以保证没有已分配的任务还在/tasks节点下，如果备份节点接管了主节点角色，就不用再区分/tasks下的任务是不是没有分配的。

Transaction封装了multi方法，提供了简单的接口。可以创建Transaction对象的实例，添加操作，提交事务。

```java
Transaction t = new Transaction();
t.delete("/a/b", -1);
t.delete("/a", -1);
List<OpResult> results = t.commit();
```

commit方法同样也有一个异步版本的方法，该方法以MultiCallback对象和上下文对象为输入。

```java
public void commit(MultiCallback cb, Object ctx);
```

multiop可以简化不止一处的主从模式的实现，当分配一个任务，在之前的例子中，主节点会创建任务分配节点，然后删除/tasks下对应的任务节点。
如果在删除/tasks下的节点时，主节点崩溃，就会导致一个已分配的任务还在/tasks下。使用multiop，可以原子化创建任务分配节点和删除/tasks下对应的任务节点这两个操作。
使用这个方式，可以保证没有已分配的任务还在/tasks节点下，如果备份节点接管了主节点角色，就不用再区分/tasks下的任务是不是没有分配的。

multiop提供的另一个功能是检查一个znode节点的版本，通过multiop可以同时读取的多个节点的ZooKeeper状态并回写数据——如回写某些读取到的数据信息。
当被检查的znode版本号没有变化时，就可以通过multiop调用来检查没有被修改的znode节点的版本号，这个功能非常有用，如在检查一个或多个znode节点的版本号取决于另外一个znode节点的版本号时。

在的主从模式的示例中，主节点需要让客户端在主节点指定的路径下添加新任务，例如，主节点要求客户端在/task-mid的子节点中添加新任务节点，其中mid为主节点的标识符，
主节点在/master-path节点中保存这个路径的数据，客户端在添加新任务前，需要先读取/master-path的数据，并通过Stat获取这个节点的版本号信息，
然后，客户端通过multiop的部分调用方式在/task-mid节点下添加新任务节点，同时会检查/master-path的版本号是否与之前读取的相匹配。

```java
public static Op check(String path, int version);
```

如果输入的path的znode节点的版本号不匹配，multi调用会失败。

```java
// 获取master数据
byte[] masterData = zk.getData("/master-path", false, stat);
String parent = new String(masterData);
...
// 两个操作的multi调用
zk.multi(Arrays.asList(Op.check("/master-path", stat.getVersion()),
                       Op.create("/woker1", modify(z1Data),-1),③
```

_注意，如果在/master节点中以主节点ID来保存路径信息，以上方式就无法正常运行，因为新主节点每次都会创建/master，从而导致/master的版本号始终为1。_

### 通过监视点代替显式缓存管理

从应用的角度来看，客户端每次都是通过访问ZooKeeper来获取给定znode节点的数据、一个znode节点的子节点列表或其他相关的ZooKeeper状态，这种方式并不可取。

反而更高效的方式为客户端本地缓存数据，并在需要时使用这些数据，一旦这些数据发生变化，你让ZooKeeper通知客户端，客户端就可以更新缓存的数据。应用的客户端通过注册监视点来接收这些通知消息。
总之，监视点可以让客户端在本地缓存一个版本的数据（比如，一个znode节点数据或节点的子节点列表信息），并在数据发生变化时接收到通知来进行更新。

ZooKeeper的设计者还可以采用另一种方式，客户端透明地缓存客户端访问的所有ZooKeeper状态，并在更新缓存数据时将这些数据置为无效。
实现这种缓存一致性的方案代价非常大，因为客户端也许并不需要缓存所有它们所访问的ZooKeeper状态，
而且服务端需要将缓存状态置为无效，为了实现失效机制，服务端不得不关注每个客户端中缓存的信息，并广播失效请求。
客户端数量很大时，这两方面的代价都非常大，这样也是不可取的。

不管是哪部分负责管理客户端缓存，ZooKeeper直接管理或ZooKeeper应用来管理，都可以通过同步或异步方式进行更新操作的客户端通知。
同步方式使所有持有该状态拷贝的客户端中的状态无效，这种方式效率很低，因为客户端往往以不同的速度运行中，因此缓慢的客户端会强制其他客户端进行等待，随着客户端越来越多，这种差异就会更加频繁发生。

设计者选择的通知方式可视为一种在客户端一侧使ZooKeeper状态失效的异步方式，ZooKeeper将给客户端的通知消息队列化，这些通知会以异步的方式进行消费。
这种失效方案也是可选方案，应用程序中需要解决，对于任何给定的客户端，哪些部分ZooKeeper状态需要置为无效。这种设计的选择更适合ZooKeeper的应用场景。

### 顺序的保障

#### 写操作的顺序

ZooKeeper状态会在所有服务端所组成的全部安装中进行复制。服务端对状态变化的顺序达成一致，并使用相同的顺序执行状态的更新。

例如，如果一个ZooKeeper的服务端执行了先建立一个/z节点的状态变化之后再删除/z节点的状态变化这个顺序的操作，所有的在集合中的服务端均需以相同的顺序执行这些变化。

所有服务端并不需要同时执行这些更新，而且事实上也很少这样操作。服务端更可能在不同时间执行状态变化，因为它们以不同的速度运行，即使它们运行在同种硬件下。
有很多原因会导致这种时滞发生，如操作系统的调度、后台任务等。

对于应用程序来说，在不同时间点执行状态更新并不是问题，因为它们会感知到相同的更新顺序。
应用程序也可能感知这一顺序，但如果ZooKeeper状态通过隐藏通道进行通信时，看下面的《读操作顺序》。

#### 读操作的顺序

ZooKeeper客户端总是会观察到相同的更新顺序，即使它们连接到不同的服务端上。但是客户端可能是在不同时间观察到了更新，如果他们还在ZooKeeper以外通信，这种差异就会更加明显。

考虑以下场景：

* 客户端c1更新了/z节点的数据，并收到应答。
* 客户端c1通过TCP的直接连接告知客户端c2，/z节点状态发生了变化。
* 客户端c2读取/z节点的状态，但是在c1更新之前就观察到了这个状态。

这称之为隐藏通道（hidden channel），因为ZooKeeper并不知道客户端之间额外的通信。现在c2获得了过期数据

![隐藏通道问题的例子](/static/img/2018-08-06-ZooKeeper/2018-08-09-23-54-21.png)

为了避免读取到过去的数据，建议应用程序使用ZooKeeper进行所有涉及ZooKeeper状态的通信。

例如，为了避免描述的场景，c2可以在/z节点设置监视点来代替从c1直接接收消息，通过监视点，c2就可以知道/z节点的变化，从而消除隐藏通道的问题。

#### 通知的顺序

ZooKeeper对通知的排序涉及其他通知和异步响应，以及对系统状态更新的顺序。

如ZooKeeper对两个状态更新进行排序，u和u'，u'紧随u之后，如果u和u'分别修改了/a节点和/b节点，
其中客户端c在/a节点设置了监视点，c只能观察到u'的更新，即接收到u所对应通知后读取/b节点。

这种顺序可以使应用通过监视点实现安全的参数配置。

假设一个znode节点/z被创建或删除表示在ZooKeeper中保存的一些配置信息变为无效的。
在对这个配置进行任何实际更新之前，将创建或删除的通知发给客户端，这一保障非常重要，可以确保客户端不会读取到任何无效配置。

假如有一个znode节点/config，其子节点包含应用配置元数据：/config/m1，/config/m2，...，/config/m_n。
主节点应用进程通过setData更新每个znode节点，且不能让客户端只读取到部分更新。

一个解决方案就是在开始更新这些配置前主节点先创建一个/config/invalid节点，其他需要读取这一状态的客户端会监视/config/invalid节点，
如果该节点存在就不会读取配置状态，当该节点被删除，就意味着有一个新的有效的配置节点集合可用，客户端可以进行读取该集合的操作。

还可以使用multiop来对/config/m[1-n]这些节点原子地执行所有setData操作，而不是使用一个znode节点来标识部分修改的状态。
在例子中的原子性问题，可以使用multiop代替对额外znode节点或通知的依赖，不过通知机制非常通用，而且并未约束为原子性的。

因为ZooKeeper根据触发通知的状态更新对通知消息进行排序，客户端就可以通过这些通知感知到真正的状态变化的顺序。

**活性与安全性**

> 因活性广泛使用了通知机制。活性（liveness）会确保系统最终取得进展。新任务和新的从节点的通知只是关于活性的事件的例子。
> 如果主节点没有对新任务进行通知，这个任务就永远不会被执行，至少从提交任务的客户端的视角来看，已提交的任务没有执行会导致活性缺失。
> 
> 原子更新一组配置节点的例子中，情况不太一样：这个例子涉及安全性，而不是活性。
> 在更新中读取znode节点可能会导致客户端到非一致性配置信息，而invalid节点可以确保只有当合法配置信息有效时，客户端才读取正确状态。
> 
> 在关于活性的例子中，通知的传送顺序并不是特别重要，只要最终客户端最终获知这些事件就可以继续取得进展。
> 不过为了安全性，不按顺序接收通知也许会导致不正确的行为。

### 监视点的羊群效应和可扩展性

当变化发生时，ZooKeeper会触发一个特定的znode节点的变化导致的所有监视点的集合。

如果有1000个客户端通过exists操作监视这个znode节点，那么当znode节点创建后就会发送1000个通知，因而被监视的znode节点的一个变化会产生一个尖峰的通知，该尖峰可能带来影响，例如，在尖峰时刻提交的操作延迟。

可能的话，建议在使用ZooKeeper时，避免在一个特定节点设置大量的监视点，最好是每次在特定的znode节点上，只有少量的客户端设置监视点，理想情况下最多只设置一个。

解决该问题的方法并不适用于所有的情况，但在以下情况下可能很有用：

假设有n个客户端争相获取一个锁（例如，主节点锁）。为了获取锁，一个进程试着创建/lock节点，如果znode节点存在了，客户端就会监视这个znode节点的删除事件。
当/lock被删除时，所有监视/lock节点的客户端收到通知。

另一个不同的方法，让客户端创建一个有序的节点/lock/lock-，ZooKeeper在这个znode节点上自动添加一个序列号，成为/lock/lock-xxx，其中xxx为序列号。
可以使用这个序列号来确定哪个客户端获得锁，通过判断/lock下的所有创建的子节点的最小序列号。

在该方案中，客户端通过/getChildren方法来获取所有/lock下的子节点，并判断自己创建的节点是否是最小的序列号。
如果客户端创建的节点不是最小序列号，就根据序列号确定序列，并在前一个节点上设置监视点。

假设有三个节点：/lock/lock-001、/lock/lock-002和/lock/lock-003：

* 创建/lock/lock-001的客户端获得锁。
* 创建/lock/lock-002的客户端监视/lock/lock-001节点。
* 创建/lock/lock-003的客户端监视/lock/lock-002节点。

这样，每个节点上设置的监视点只有最多一个客户端。

另一方面需要注意的问题，就是当服务端一侧通过监视点产生的状态变化。

设置一个监视点需要在服务端创建一个Watcher对象，根据[YourKit](http://www.yourkit.com/)的分析工具所分析，
设置一个监视点会使服务端的监视点管理器的内存消耗上增加大约250到300个字节，设置非常多的监视点意味着监视点管理器会消耗大量的服务器内存。

例如，如果存在一百万个监视点，估计会消耗0.3GB的内存，因此，开发者必须时刻注意设置的监视点数量。

### 总结

* ZooKeeper提供了跟踪重要事件的有效机制，使系统中的进程可以根据事件进行相应的处理。正常流程的应用（如，任务的执行）或崩溃故障的处理（如主节点崩溃）。
* ZooKeeper的一个重要功能便是通知（notifications）。
	* ZooKeeper客户端通过ZooKeeper来注册监视点，在ZooKeeper状态变化发生时，接收通知。
	* 通知的传送顺序很重要，客户端不可以自己通过某些方式观察ZooKeeper状态变化的顺序。
* 在同时处理多个变化的调用时，一个很有用的功能便是multi方法。
	* 这个功能可以一次执行多个操作，以便在客户端对事件进行响应并改变ZooKeeper的状态时，避免在分布式应用的竞态条件。
* 大多数应用应之前所讨论的模式，即使是该模式的各种变体也可以。
* 专注于异步API，并且建议开发者也使用异步的方式，异步API可以让应用程序更有效地使用ZooKeeper资源，同时获得更高的性能。

## 故障处理

故障发生的主要点有三个：ZooKeeper服务、网络、应用程序。故障恢复取决于所找到的故障发生的具体位置，不过查找具体位置并不是简单的事情。

简单的分布式应用示意图：

![简单的分布式应用示意图](/static/img/2018-08-06-ZooKeeper/2018-08-10-10-43-12.png)

简单结构，只有两个进程组成应用程序，三个服务器组成了ZooKeeper的服务。
进程会随机连接到其中一个服务器，也可能断开后再次连接到另一个不同的服务器，服务器使用内部协议来保持客户端之间状态的同步，对客户端呈现一致性视图。

![简单的分布式系统的故障情况](/static/img/2018-08-06-ZooKeeper/2018-08-10-10-44-56.png)

系统的不同组件中可能发生的一些故障。终点在于如何区分一个应用中不同类型的故障。

例如，如果发生网络故障，c1如何区分网络故障和ZooKeeper服务终端之间的区别？

如果ZooKeeper服务中只有s1服务器停止运行，其他的ZooKeeper服务器还会继续运行，如果此时没有网络问题，c1可以连接到其他的服务器上。
不过，如果c1无法连接到任何服务器，可能是因为当前服务不可用（也许因为集合中大多数服务器停止运行），或因为网络故障导致。

这个例子展示了并不是所有的基于组件中发生的故障都可以被处理，因此ZooKeeper需要呈现系统视图，同时开发者也基于该视图进行开发。

再从c2的视角看，网络故障持续足够长的时间将会导致c1与ZooKeeper之间的会话过期，然而即使c1实际上仍然活着，ZooKeeper还是会因为c1无法与任何服务器通信而声明c1已经为不活动状态。
如果c1正在监视自己创建的临时性节点，就可以收到c1终止的通知，因此c2也将确认c1已经终止，因为ZooKeeper也是如此通知的，即使在这个场景中c1还活着。

在这个场景中，c1无法与ZooKeeper服务进行通信，它自己知道自己活着，但不无法确定ZooKeeper是否声明它的状态是否为终止状态，因此必须以最坏的情况进行假设。
如果c1进行其他操作，但已经中止的进程不应该进行其他操作（例如改变外部资源），这样可能会破坏整个系统。
如果c1再也无法重新连接到ZooKeeper并发现它的会话已经不再处于活动状态，它需要确保整个系统的其他部分的一致性，并中止或执行重启逻辑，以新的进程实例的方式再次连接。

**事后评测ZooKeeper方案**

> 事后评测ZooKeeper的方案的确很诱人。之前也曾经这么做过，遗憾的是，首先问题具有不确定性，如本章之前所介绍的。
> 如果是ZooKeeper发生错误，事后评测也许的确猜测正确了，但如果ZooKeeper正常工作，也许猜测结果是不正确的。ZooKeeper被指定为真实性的源头，系统的设计会更简单，故障也更容易识别和诊断。

### 可恢复的故障

ZooKeeper呈现给使用某些状态的所有客户端进程一致性的状态视图。

当一个客户端从ZooKeeper获得响应时，客户端可以非常肯定这个响应信息与其他响应信息或其他客户端所接收的响应均保持一致性。
有时，ZooKeeper客户端库与ZooKeeper服务的连接会丢失，而且无法提供一致性保障的信息，
当客户端库发现自己处于这种情况时，就会使用Disconnected事件和ConnectionLossException异常来表示自己无法了解当前的系统状态。

ZooKeeper客户端库会积极地尝试，使自己离开这种情况，它会不断尝试重新连接另一个ZooKeeper服务器，直到最终重新建立了会话。

一旦会话重新建立，ZooKeeper会产生一个SyncConnected事件，并开始处理请求。ZooKeeper还会注册之前已经注册过的监视点，并会对失去连接这段时间发生的变更产生监视点事件。

Disconnected事件和ConnectionLossException异常的产生的一个典型原因是因为ZooKeeper服务器故障。

![连接丢失的例子](/static/img/2018-08-06-ZooKeeper/2018-08-10-11-00-13.png)

客户端连接到服务器s2，其中s2是两个活动ZooKeeper服务器中的一个，当s2发生故障，客户端的Watcher对象就会收到Disconnected事件，并且，所有进行中的请求都会返回ConnectionLossException异常。
整个ZooKeeper服务本身依然正常，因为大多数的服务器仍然处于活动状态，所以客户端会快速与新的服务器重新建立会话。

如果客户端没有进行中的请求，这种情况只会对客户端产生很小的影响。紧随Disconnected事件之后为SyncConnected事件，客户端并不会注意到变化，
但是，如果存在进行中的请求，连接丢失就会产生很大的影响。

如果此时客户端正在进行某些请求，比如刚刚提交了一个create操作的请求，当连接丢失发生时，对于同步请求，客户端会得到ConnectionLossException异常，对于异步请求，会得到CONNECTIONLOSS返回码。
然而，客户端无法通过这些异常或返回码来判断请求是否已经被处理，如所看到的，处理连接丢失会使的代码更加复杂，因为应用程序代码必须判断请求是否已经完成。
处理连接丢失这种复杂情况，一个非常糟糕的方法是简单处理，当接收到ConnectionLossException异常或CONNECTIONLOSS返回码时，客户端停止所有工作，并重新启动，虽然这样可以使代码更加简单，但是，本可能是一个小影响，却变为重要的系统事件。

一个以90个客户端进程连接到一个由3个服务器组成的ZooKeeper集群的系统。
如果应用采用了简单却糟糕的方式，现在有一个ZooKeeper服务器发生故障，30个客户端进程将会关闭，然后重启与ZooKeeper的会话，更糟糕的是，
客户端进程在还没有与ZooKeeper连接时就关闭了会话，因此这些会话无法被显式地关闭，ZooKeeper也只能通过会话超时来监测故障。
最后结果是三分之一的应用进程重启，重启却被延迟，因为新的进程必须等待之前旧的会话过期后才可以获得锁。
换句话说，如果应用正确地处理连接丢失，这种情况只会产生很小的系统损坏。

当一个进程失去连接后就无法收到ZooKeeper的更新通知，但是一个进程也许会在会话丢失时错过了某些重要的状态变化。

![活动死节点的影响](/static/img/2018-08-06-ZooKeeper/2018-08-10-12-07-49.png)

客户端c1作为群首，在t2时刻失去了连接，但是并没发现这个情况，直到t4时刻才声明为终止状态，同时，会话在t2时刻过期，
在t3时刻另一个进程成为群首，从t2到t4时刻旧的群首并不知道它自己被声明为终止状态，而另一个群首已经接管控制。

如果开发者不仔细处理，旧的群首会继续担当群首，并且其操作可能与新的群首相冲突。因此，当一个进程接收到Disconnected事件时，在重新连接之前，进程需要挂起群首的操作。
正常情况下，重新连接会很快发生，如果客户端失去连接持续了一段时间，进程也许会选择关闭会话，当然，如果客户端失去连接，关闭会话也不会使ZooKeeper更快地关闭会话，ZooKeeper服务依然会等待会话过期时间过去以后才声明会话已过期。

**很长的延时与过期**

> 当连接丢失发生时，一般情况都会快速地重新连接到另一个服务器，但是网络中断持续了一段时间可能会导致客户端重新连接ZooKeeper服务的一个长延时。
> 一些开发者想要知道为什么ZooKeeper客户端库没有在某些时刻（比如两倍的会话超时时间）做出判断，够了，自己关闭会话吧。
> 
> 对这个问题有两个答案。
> 
> * 首先，ZooKeeper将这种策略问题的决策权交给开发者，开发者可以很容易地实现关闭句柄这种策略。
> * 其次，当整个ZooKeeper集合停机时，时间冻结，然而当整个集合恢复了，会话的超时时间被重置，如果使用ZooKeeper的进程挂起在那里，它们会发现长时间超时是因为ZooKeeper长时间的故障，ZooKeeper恢复后，客户端回到之前的正确状态，进程也就不用额外地重启延迟时间。

#### 已存在的监视点与Disconnected事件

为了使连接断开与重现建立会话之间更加平滑，ZooKeeper客户端库会在新的服务器上重新建立所有已经存在的监视点。
当客户端连接ZooKeeper的服务器，客户端会发送监视点列表和最后已知的zxid（最终状态的时间戳），服务器会接受这些监视点并检查znode节点的修改时间戳与这些监视点是否对应，
如果任何已经监视的znode节点的修改时间戳晚于最后已知的zxid，服务器就会触发这个监视点。

每个ZooKeeper操作都完全符合该逻辑，除了exists。exists操作与其他操作不同，因为这个操作可以在一个不存在的节点上设置监视点。

![通知的特殊情况](/static/img/2018-08-06-ZooKeeper/2018-08-10-16-08-57.png)

这种特殊情况，导致错过了一个设置了监视点的znode节点的创建事件，客户端监视/event节点的创建事件，然而就在/event被另一个客户端创建时，设置了监视点的客户端与ZooKeeper间失去连接，
在这段时间，其他客户端删除了/event，因此当设置了监视点的客户端重新与ZooKeeper建立连接并注册监视点，ZooKeeper服务器已经不存在/event节点了，
因此，当处理已经注册的监视点并判断/event的监视时，发现没有/event这个节点，所以就只是注册了这个监视点，最终导致客户端错过了/event的创建事件。

因为这种特殊情况，你需要尽量避免监视一个znode节点的创建事件，如果一定要监视创建事件，应尽量监视存活期更长的znode节点，否则这种特殊情况可能会伤害你。

**自动重连处理危害**

> 有些ZooKeeper的封装库通过简单的补发命令自动处理连接丢失的故障，有些情况这样做完全可以接受，但有些情况可能会导致错误的结果。
> 
> 例如，如果/leader节点用来建立领导权，程序在执行create操作建立/leader节点时连接丢失，而盲目地重试create操作会导致第二个create操作执行失败，
> 因为/leader节点已经存在，因此该进程就会假设其他进程获得了领导权。当然，如果你知道这种情况的可能性，也了解封装库如何工作的，你可以识别并处理这种情况。
> 有些库过于复杂，所以，如果你使用到了这种库，最好能理解ZooKeeper的原理以及该库提供给保障机制。

### 不可恢复的故障

有时，一些更糟的事情发生，导致会话无法恢复而必须被关闭。

* 最常见的原因是会话过期；
* 另一个原因是已认证的会话无法再次与ZooKeeper完成认证。

这两种情况下，ZooKeeper都会丢弃会话的状态。

当客户端无法提供适当的认证信息来完成会话的认证时，或Disconnected事件后客户端重新连接到已过期的会话，就会发生不可恢复的故障。客户端库无法确定自己的会话是否已经失败。

处理不可恢复故障的最简单方法就是中止进程并重启，这样可以使进程恢复原状，通过一个新的会话重新初始化自己的状态。
如果该进程继续工作，首先必须要清除与旧会话关联的应用内部的进程状态信息，然后重新初始化新的状态。

**从不可恢复故障自动恢复的危害**

> 简单地重新创建ZooKeeper句柄以覆盖旧的句柄，通过这种方式从不可恢复的故障中自动恢复，这听起来很吸引人。
> 
> 事实上，早期ZooKeeper实现就是这么做的，但是早期用户注意到这会引发一些问题。
> 认为自己是群首的一个进程的会话中断，但是在通知其他管理线程它不是群首之前，这些线程通过新句柄操作那些只应该被群首访问的数据。
> 为了保证句柄与会话之间一对一的对应关系，ZooKeeper现在避免了这个问题。有些情况自动恢复机制工作得很好，比如客户端只读取数据某些情况，但是如果客户端修改ZooKeeper中的数据，从会话故障中自动恢复的危害就非常重要。

### 群首选举和外部资源

ZooKeeper为所有客户端提供了系统的一致性视图，只要客户端与ZooKeeper进行任何交互操作（例子中所进行的操作），ZooKeeper都会保持同步。
然而，ZooKeeper无法保护与外部设备的交互操作。这种缺乏保护的特殊问题的说明，在实际环境中也经常被发现，常常发生于主机过载的情况下。

当运行客户端进程的主机发生过载，就会开始发生交换、系统颠簸或因已经超负荷的主机资源的竞争而导致的进程延迟，这些都会影响与ZooKeeper交互的及时性。

* 一方面，ZooKeeper无法及时地与ZooKeeper服务器发送心跳信息，导致ZooKeeper的会话超时；
* 另一方面，主机上本地线程的调度会导致不可预知的调度：一个应用线程认为会话仍然处于活动状态，并持有主节点，即使ZooKeeper线程有机会运行时才会通知会话已经超时。

协调外部资源：

![协调外部资源](/static/img/2018-08-06-ZooKeeper/2018-08-10-16-30-03.png)

应用程序通过使用ZooKeeper来确保每次只有一个主节点可以独占访问一个外部资源，这是一个很普遍的资源中心化管理的方法，用来确保一致性。

在时间轴的开始，客户端c1为主节点并独占方案外部资源。事件发生顺序如下：

1. 在t1时刻，因为超载导致与ZooKeeper的通信停止，c1没有响应，c1已经排队等候对外部资源的更新，但是还没收到CPU时钟周期来发送这些更新。
2. 在t2时刻，ZooKeeper声明了c1'与ZooKeeper的会话已经终止，同时删除了所有与c1'会话关联的临时节点，包括用于成为主节点而创建的临时性节点。
3. 在t3时刻，c2成为主节点。
4. 在t4时刻，c2改变了外部资源的状态。
5. 在t5时刻，c1'的负载下降，并发送已队列化的更新到外部资源上。
6. 在t6时刻，c1与ZooKeeper重现建立连接，发现其会话已经过期且丢掉了管理权。遗憾的是，破坏已经发生，在t5 时刻，已经在外部资源进行了更新，最后导致系统状态损坏。

时钟偏移也可能导致类似的问题。因系统超载而导致时钟冻结，有时候，时钟偏移会导致时间变慢甚至落后，使得客户端认为自己还安全地处于超时周期之内，因此仍然具有管理权，尽管其会话已经被ZooKeeper置为过期。

解决这个问题有几个方法：

* 一个方法是确保应用不会在超载或时钟偏移的环境中运行，小心监控系统负载可以检测到环境出现问题的可能性，良好设计的多线程应用也可以避免超载，时钟同步程序可以保证系统时钟的同步。
* 另一个方法是通过ZooKeeper扩展对外部设备协作的数据，使用一种名为隔离（fencing）的技巧，分布式系统中常常使用这种方法用于确保资源的独占访问。

如何通过隔离符号来实现一个简单的隔离。只有持有最新符号的客户端，才可以访问资源。

在创建代表群首的节点时，可以获得Stat结构的信息，其中该结构中的成员之一，czxid，表示创建该节点时的zxid，zxid为唯一的单调递增的序列号，因此可以使用czxid作为一个隔离的符号。

当对外部资源进行请求时，或在连接外部资源时，还需要提供这个隔离符号，如果外部资源已经接收到更高版本的隔离符号的请求或连接时，的请求或连接就会被拒绝。
也就是说如果一个主节点连接到外部资源开始管理时，若旧的主节点尝试对外币资源进行某些处理，其请求将会失败，这些请求会被隔离开。即使出现系统超载或时钟偏移，隔离技巧依然可以可靠地工作。

![通过ZooKeeper使用隔离](/static/img/2018-08-06-ZooKeeper/2018-08-10-18-28-03.png)

当c1在t1 时刻成为群首，创建/leader节点的zxid为3（真实环境中，zxid为一个很大的数字），在连接数据库时使用创建的zxid值作为隔离符号。
之后，c1因超载而无法响应，在t2时刻，ZooKeeper声明c1终止，c2成为新的群首。c2使用4所作为隔离符号，因为其创建/leader节点的创建zxid为4。
在t3时刻，c2开始使用隔离符号对数据库进行操作请求。在t4 时刻，c1'的请求到达数据库，请求会因传入的隔离符号（3）小于已知的隔离符号（4）而被拒绝，因此避免了系统的破坏。

不过，隔离方案需要修改客户端与资源之间的协议，需要在协议中添加zxid，外部资源也需要持久化保存来跟踪接收到的最新的zxid。

一些外部资源，比如文件服务器，提供局部锁来解决隔离的问题。
不过这种锁也有很多限制，已经被ZooKeeper移出并声明终止状态的群首可能仍然持有一个有效的锁，因此会阻止新选举出的群首获取这个锁而导致无法继续，
在这种情况下，更实际的做法是使用资源锁来确定领导权，为了提供有用信息的目的，由群首创建/leader节点。

### 总结

为了更有效地处理故障，开发者在使用ZooKeeper时需要处理状态变化的事件、故障代码以及ZooKeeper抛出的异常。
不过，不是所有故障在任何情况下都采用一样的方式去处理，有时开发者需要考虑连接断开的状态，或处理连接断开的异常，因为进程并不知道系统其他部分发生了什么，
甚至不知道自己进行中的请求是否已经执行。在连接断开这段时间，进程不能假设系统中的其他部分还在运行中。
即使ZooKeeper客户端库与ZooKeeper服务器重新建立了连接，并重新建立监视点，也需要校验之前进行中的请求的结果是否成功执行。

## ZooKeeper注意事项

### 使用ACL

ZooKeeper通过访问控制表（ACL）来控制访问权限。一个ACL包括以下形式的记录：scheme：auth-info，其中scheme对应了一组内置的鉴权模式，auth-info为对于特定模式所对应的方式进行编码的鉴权信息。

ZooKeeper通过检查客户端进程访问每个节点时提交上来的授权信息来保证安全性。
如果一个进程没有提供鉴权信息，或者鉴权信息与要请求的znode节点的信息不匹配，进程就会收到一个权限错误。

```java
void addAuthInfo(
    String scheme,
    byte auth[]
    )
```

* scheme
	* 表示所采用的鉴权模式。
* auth
	* 表示发送给服务器的鉴权信息。该参数的类型为byte[]类型，不过大部分的鉴权模式需要一个String类型的信息，所以你可以通过String.getBytes()来将String转换为byte[]。

一个进程可以在任何时候调用addAuthInfo来添加鉴权信息。一般情况下，在ZooKeeper句柄创建后就会调用该方法来添加鉴权信息。
进程中可以多次调用该方法，为一个ZooKeeper句柄添加多个权限的身份。

#### 内置鉴权模式

ZooKeeper提供了4种内置模式进行ACL的处理。

已经使用过通过OPEN_ACL_UNSAFE常量隐式传递了ACL策略，这种ACL使用world作为鉴权模式，使用anyone作为auth-info，对于world这种鉴权模式，只能使用anyone这种auth-info。

另一种特殊的内置模式为管理员所使用的super模式，该模式不会被列入到任何ACL中，但可以用于ZooKeeper的鉴权。一个客户端通过super鉴权模式连接到ZooKeeper后，不会被任何节点的ACL所限制。

digest为内置鉴权模式，该模式的auth-info格式为userid:passwd_digest，当调用addAuthInfo时需要设置ACL和userid:password信息。

```text
digest:amy:Iq0onHjzb4KyxPAp8YWOIC8zzwY=, READ | WRITE | CREATE | DELETE | ADMIN
```

使用下面的DigestAuthenticationProvider来为她的账户生成摘要信息。

```shell
java -cp $ZK_CLASSPATH org.apache.zookeeper.server.auth.DigestAuthenticationProvider amy:secret
....
amy:secret->amy:Iq0onHjzb4KyxPAp8YWOIC8zzwY=
```

```shell
[zk: localhost:2181(CONNECTED) 1] addauth digest amy:secret
```

ip鉴权模式需要提供网络的地址和掩码，因为需要通过客户端的地址来进行ACL策略的检查，客户端在使用ip模式的ACL策略访问znode节点时，不需要调用addAuthInfo方法。

```text
# 设置的ACL
digest:dom:XXXXX, READ | WRITE | CREATE | DELETE | ADMIN
digest:nico:XXXXX, READ | WRITE | CREATE | DELETE | ADMIN
ip:10.11.12.0/24, READ
```

**用户名和密码的摘要信息从何而来？**

> 你也许注意到用于摘要的用户名和密码似乎凭空而来。实际上确实如此。
> 这些用户名或密码不用对应任何真实系统的标识，甚至用户名也可以重复。也许有另一个开发人员叫Amy，并且开始和Dom和Nico一同工作，
> Dom可以使用amy：XXXXX来添加她的ACL策略，只是在这两个Amy的密码一样时会发生冲突，因为这样就导致她们俩可以互相访问对方的信息。

#### SASL和Kerberos

* 首先，如果新的开发人员加入或离开组，管理员就需要改变所有的ACL策略，如果通过组来避免这种情况，那么事情就会好一些。
* 其次，如果想修改某写开发人员的密码，也需要修改所有的ACL策略。
* 最后，如果网络不可信，无论是digest模式还是ip模式都不是最合适的模式。可以通过使用ZooKeeper提供的sasl模式来解决这些问题。

SASL表示简单认证与安全层（Simple Authentication and Security Layer）。SASL将底层系统的鉴权模型抽象为一个框架，因此应用程序可以使用SASL框架，并使用SASL支持多各种协议。
在ZooKeeper中，SASL常常使用Kerberos协议，该鉴权协议提供之前提到的那些缺失的功能。在使用SASL模式时，使用sasl作为模式名，id则使用客户端的Kerberos的ID。

SASL是ZooKeeper的扩展鉴权模式，因此，需要通过配置参数或Java系统中参数激活该模式。

* 如果你采用ZooKeeper的配置文件方式，需要使用authProvider.XXX配置参数，
* 如果你想要通过系统参数方式，需要使用zookeeper.authProvider.XXX作为参数名。

这两种情况下，XXX可以为任意值，只要没有任何重名的authProvider，一般XXX采用以0开始的一个数字。配置项的参数值为org.apache.zookeeper.server.auth.SASLAuthenticationProvider，这样就可以激活SASL模式。

#### 增加新鉴权模式

ZooKeeper中还可以使用其他的任何鉴权模式。对于激活新的鉴权模式来说只是简单的编码问题。

在org.apache.zookeeper.server.auth包中提供了一个名为AuthenticationProvider的接口类，如果你实现你自己的鉴权模式，
你可以将类发布到服务器的classpath下，创建zookeeper.authProvider名称前缀的Java系统参数，并将参数值设置为你实现AuthenticationProvider接口的实际的类名。

### 恢复会话

假如ZooKeeper客户端崩溃，之后恢复运行，应用程序在恢复运行后需要处理一系列问题。

首先，应用程序的ZooKeeper状态还处于客户端崩溃时的状态，其他客户端进程还在继续运行，也许已经修改了ZooKeeper的状态，
因此，建议客户端不要使用任何之前从ZooKeeper获取的缓存状态，而是使用ZooKeeper作为协作状态的可信来源。

例如，如果主要主节点崩溃并恢复，与此同时，集群也许已经对分配的任务完成了切换到备份主节点的故障转移。
当主要主节点恢复后，就不能再认为自己是主节点，并认为待分配任务列表已经发生变化。

第二个重要问题是客户端崩溃时，已经提交给ZooKeeper的待处理操作也许已经完成了，由于客户端崩溃导致无法收到确认消息，ZooKeeper无法保证这些操作肯定会成功执行，
因此，客户端在恢复时也许需要进行一些ZooKeeper状态的清理操作，以便完成某些未完成的任务。

例如，如果的主节点崩溃前进行了一个已分配任务的列表删除操作，在恢复并再次成为主要主节点时，就需要再次删除该任务。

论会话过期的问题。对于会话过期，不能认为是客户端崩溃。会话也许因为网络问题或其他问题过期，
比如Java中的垃圾回收中断，在会话过期的情况下，客户端需要考虑ZooKeeper状态也许已经发生了改变，或者客户端对ZooKeeper的请求也许并未完成。

### 当znode节点重新创建时，重置版本号

znode节点被删除并重建后，其版本号将会被重置。如果应用程序在一个znode节点重建后，进行版本号检查会导致错误的发生。

### sync方法

如果应用客户端只对ZooKeeper的读写来通信，应用程序就不用考虑sync方法。
sync方法的设计初衷，是因为与ZooKeeper的带外通信可能会导致某些问题，这种通信常常称为隐蔽通道（hidden channel）。

问题主要源于一个客户端c也许通过某些直接通道（例如，c和c'之间通过TCP连接进行通讯）来通知另一个客户端c进行ZooKeeper状态变化，但是当c读取ZooKeeper的状态时，却并未发现变化情况。

这一场景发生的原因，可能因为这个客户端所连接的服务器还没来得及处理变化情况，而sync方法可以用于处理这种情况。

sync为异步调用的方法，客户端在读操作前调用该方法，假如客户端从某些直接通道收到了某个节点变化的通知，
并要读取这个znode节点，客户端就可以通过sync方法，然后再调用getData方法：

```java
...
zk.sync(path, voidCb, ctx);①
zk.getData(path, watcher, dataCb, ctx);②
...
```

* sync方法接受一个path参数，一个void返回类型的回调方法的示例，一个上下文对象实例。

sync方法的path参数指示需要进行操作的路径。
在系统内部，sync方法实际上并不会影响ZooKeeper，当服务端处理sync调用时，服务端会刷新群首与调用sync操作的客户端c所连接的服务端之间的通道，
刷新的意思就是说在调用getData的返回数据的时候，服务端确保返回所有客户端c调用sync方法时所有可能的变化情况。

在上面的隐蔽通道的情况中，变化情况的通信会先于sync操作的调用而发生，因此当c收到getData调用的响应，响应中必然会包含c'所通知的变化情况。

_注意，在此时该节点也可能发生了其他变化，因此在调用getData时，ZooKeeper只保证所有变化情况能够返回。_

使用sync还有一个注意事项，这个需要深入ZooKeeper内部的技术问题。
因为ZooKeeper的设计初衷是用于快速读取以及以读为主要负载的扩展性考虑，所以简化了sync的实现，同时与其他常规的更新操作（如create、setData或delete）不同，sync操作并不会进入执行管道之中。
sync操作只是简单地传递到群首，之后群首会将响应包队列化，传递给群组成员，之后发送响应包。
不过还有另外一种可能，仲裁机制确定的群首l'，现在已经不被仲裁组成员所认可，仲裁组成员现在选举了另个群首l'，在这种情况下，群首l可能无法处理所有的更新操作的同步，而sync调用也就可能无法履行其保障。

ZooKeeper的实现中，通过以下方式处理上面的问题:

ZooKeeper中的仲裁组成员在放弃一个群首时会通知该群首，通过群首与群组成员之间的tickTime来控制超时时间，当它们之间的TCP连接丢失，群组成员在收到socket的异常后就会确定群首是否已经消失。
群首与群组成员之间的超时会快于TCP连接的中止，虽然的确存在这种极端情况导致错误的可能，但是在现有经验中还未曾遇到过。
在邮件列表的讨论组中，曾经多次讨论过该问题，希望将sync操作放入执行管道，并可以一并消除这种极端情况。就目前来看，ZooKeeper的实现依赖于合理的时序假设，因此没有什么问题。

### 顺序性保障

虽然ZooKeeper声明对一个会话中所有客户端操作提供顺序性的保障，但还是会存在ZooKeeper控制之外某些情况，可能会改变客户端操作的顺序。

#### 连接丢失时的顺序性

对于连接丢失事件，ZooKeeper会取消等待中的请求，对于同步方法的调用客户端库会抛出异常，对于异步请求调用，客户端调用的回调函数会返回结果码来标识连接丢失。
在应用程序的连接丢失后，客户端库不会再次重新提交请求，因此就需要应用程序对已经取消的请求进行重新提交的操作。
所以，在连接丢失的情况下，应用程序可以依赖客户端库来解决所有后续操作，而不能依赖ZooKeeper来承担这些操作。

连接丢失对应用程序的影响:

1. 应用程序提交请求，执行Op1操作。
2. 客户端检测到连接丢失，取消了Op1操作的请求。
3. 客户端在会话过期前重新连接。
4. 应用程序提交请求，执行Op2操作。
5. Op2执行成功。
6. Op1返回CONNECTIONLOSS事件。
7. 应用程序重新提交Op1操作请求。

在这种情况中，应用程序按顺序提交了Op1和Op2请求，但Op2却先于Op1成功执行。

当应用程序在Op1的回调函数中发现连接丢失情况后，应用程序再次提交请求，但是假设客户端还没有成功重连，再次提交Op1还是会得到连接丢失的返回，因此在重新连接前存在一个风险，
即应用程序进入重新提交Op1请求的无限循环中，为了跳出该循环，应用程序可以设置重试的次数，或者在重新连接时间过长时关闭句柄。

Op2在某种程度上依赖与Op1操作，为了避免Op2在Op1之前成功执行，可以等待Op1成功执行之后在提交Op2请求，这种方法在很多主从应用的示例代码中使用过，以此来保证请求按顺序执行。
通常，等待Op1操作结果的方法很安全，但是带来了性能上的损失，因为应用程序需要等待一个请求的操作结果再提交下一个，而不能将这些操作并行化。

**假如摆脱CONNECTIONLOSS会怎样？**

> CONNECTIONLOSS事件的存在的本质原因，因为请求正在处理中，但客户端与服务端失去了连接。
> 比如，对于一个create操作请求，在这种情况下，客户端并不知道请求是否处理完成，然而客户端可以询问服务端来确认请求是否成功执行。
> 服务端可以通过内存或日志中缓存的信息记录，知道自己处理了哪些请求，因此这种方式也是可行的。
> 如果开发社区最终改变了ZooKeeper的设计，在重新连接时服务端访问这些缓存信息，就可以取消无法保证前置操作执行成功的限制，因为客户端可以在需要时重新执行待处理的请求。
> 但到目前为止，开发人员还需要注意这一限制，并妥善处理连接丢失的事件。

#### 同步API和多线程的顺序性

目前，多线程应用程序非常普遍，如果你在多线程环境中使用同步API，你需要特别注意顺序性问题。

一个同步ZooKeeper调用会阻塞运行，直到收到响应信息，如果两个或更多线程向ZooKeeper同时提交了同步操作，这些线程中将会被阻塞，直到收到响应信息，
ZooKeeper会顺序返回响应信息，但操作结果可能因线程调度等原因导致后提交的操作而先被执行。

如果ZooKeeper返回响应包与请求操作非常接近：如果不同的线程同时提交了多个操作请求，可能是一些并不存在某些直接联系的操作，或不会因任意的执行顺序而导致一致性问题的操作。
但如果这些操作具有相关性，客户端应用程序在处理结果时需要注意这些操作的提交顺序。

#### 同步和异步混合调用的顺序性

假如你通过异步操作提交了两个请求，Aop1和Aop2，不管这两个操作具体是什么，只是通过异步提交的两个操作。
在Aop1的回调函数中，你进行了一个同步调用，Sop1，该同步调用阻塞了ZooKeeper客户端的分发线程，这样就会导致客户端应用程序接收Sop1的结果之后才能接收到Aop2的操作结果。
因此应用程序观察到的操作结果顺序为Aop1、Sop1、Aop2，而实际的提交顺序并非如此。

通常，混合同步调用和异步调用并不是好方法，不过也有例外的情况。
例如当启动程序时，你希望在处理之前先在ZooKeeper中初始化某些数据，虽然这时可以使用Java锁或其他某些机制处理，但采用一个或多个同步调用也可以完成这项任务。

### 数据字段和子节点的限制

ZooKeeper默认情况下对数据字段的传输限制为1MB，该限制为任何节点数据字段的最大可存储字节数，同时也限制了任何父节点可以拥有的子节点数。

选择1MB是随意制定的，在某种意义上来说，没有任何基本原则可以组织ZooKeeper使用其他值，更大或更小的限制。

然而设置限制值可以保证高性能。

如果一个znode节点可以存储很大的数据，就会在处理时消耗更多的时间，甚至在处理请求时导致处理管道的停滞。
如果一个客户端在一个拥有大量子节点的znode节点上执行getChildren操作，也会导致同样的问题。

### 嵌入式ZooKeeper服务器


很多开发人员考虑在其应用中嵌入ZooKeeper服务器，以此来隐藏对ZooKeeper的依赖。对于“嵌入式”，指在应用内部实例化ZooKeeper服务器的情况。
该方法使应用的用户对ZooKeeper的使用透明化，虽然这个主意听起来很吸引人（毕竟谁都不喜欢额外的依赖），但还是不建议这样做。

观察到一些采用嵌入式方式的应用中所遇到的问题，如果ZooKeeper发生错误，用户将会查看与ZooKeeper相关的日志信息，
从这个角度看，对用户已经不再是透明化的，而且应用开发人员也许无法处理这些ZooKeeper的问题。
甚至更糟的是，整个应用的可用性和ZooKeeper的可用性被耦合在一起，如果其中一个退出，另一个也必然会退出。
ZooKeeper常常被用来提供高可用服务，但对于应用中嵌入ZooKeeper的方式却降低了其最强的优势。

虽然不建议采用嵌入式ZooKeeper服务器，但也没有什么理论阻止一个人这样做，例如，在ZooKeeper测试程序中，
因此，如果你真的想要采用这种方式，ZooKeeper的测试程序是一个很好的资源，教你如何去做。

## Curator：ZooKeeper API的高级封装库

Curator作为ZooKeeper的一个高层次封装库，为开发人员封装了ZooKeeper的一组开发库，Curator的核心目标就是为你管理ZooKeeper的相关操作，将连接管理的复杂操作部分隐藏起来（理想上是隐藏全部）。

连接管理很棘手，通过Curator有时就可以顺利解决。

Curator为开发人员实现了一组常用的管理操作的菜谱，同时结合开发过程中的最佳实践和常见的边际情况的处理。
例如，Curator实现了如锁（lock）、屏障（barrier）、缓存（cache）这些原语的菜谱，还实现了流畅（fluent）式的开发风格的接口。
流畅式接口能够让将ZooKeeper中create、delete、getData等操作以流水线式的编程方式链式执行。
同时，Curator还提供了命名空间（namespace）、自动重连和一些其他组件，使得应用程序更加健壮。

### Cureator客户端程序

首先需要创建一个客户端实例，客户端实例为CuratorFramework类的实例对象，通过调用Curator提供的工厂方法来获得该实例：

```java
CuratorFramework zkc =CuratorFrameworkFactory.newClient(connectString, retryPolicy);
```

* connectString输入参数为将要连接的ZooKeeper服务器的列表，就像创建ZooKeeper客户端时一样。
* retryPolicy参数为Curator提供的新特性，通过这个参数，开发人员可以指定对于失去连接事件重试操作的处理策略。
	* 常规的ZooKeeper接口的开发中，在发生连接丢失事件时，往往需要再次提交操作请求。

> 个CuratorZooKeeperClient类，该类在ZooKeeper客户端实例上提供了某些附加功能，如保证请求操作在不可预见的连接断开情况下也能够安全执行，
> 与CuratorFramework类不同，CuratorZooKeeperClient类中的操作执行与ZooKeeper客户端句柄直接相对应。

### 流畅式API

```java
zk.create("/mypath",
          new byte[0],
          ZooDefs.Ids.OPEN_ACL_UNSAFE,
          CreateMode.PERSISTENT);
zkc.create().withMode(CreateMode.PERSISTENT).forPath("/mypath", new byte[0]);
```

delete、getData、checkExists和getChildren方法也适用这种Builder模式。

对于异步的执行方法，只需要增加inBackground：

```java
zkc.create().inBackground().withMode(CreateMode.PERSISTENT).forPath("/mypath", new byte[0]);
```

很多方法可以实现异步调用的回调处理。

inBackground调用可以传入一个上下文对象，通过该参数可以传入一个具体的回调方法的实现，或是一个执行回调的执行器（java.util.concurrent.Executor）。
可以通过执行器将回调方法的执行与ZooKeeper客户端线程的运行解耦，采用执行器常常比为每个任务新建一个线程更好。

```java
zkc.getData().inBackground().watched().forPath("/mypath");
```

监视点将会通过监听器触发通知，这些通知将会以WATCHED事件传递给指定的监听器。
还可以使用usingWathcer方法替换watched方法，usingWathcer方法接受一个普通的ZooKeeper的Wathcer对象，并在接收到通知后调用该监视点方法。
第三种选择就是传入一个CuratorWatcher对象，CuratorWatcher的process方法与ZooKeeper的Watcher不同的是，它可能会抛出异常。

### 监听器

监听器（listener）负责处理Curator库所产生的事件，使用这种机制时，应用程序中会实现一个或多个监听器，
并将这些监听器注册到Curator的框架客户端实例中，当有事件发生时，这些事件就会传递给所有已注册的监听器。
监听器机制是一种通用模式，在异步处理事件时都可以使用这种机制。

Curator使用监听器来处理回调方法和监视通知。该机制也可以用于后台任务产生的异常处理逻辑中。

```java
CuratorListener masterListener = new CuratorListener() {
	@Override
	public void eventReceived(CuratorFramework client, CuratorEvent event){
		try{
			LOG.info("Event path: " + event.getPath());
			switch (event.getType()) { 
			case CHILDREN:
				if(event.getPath().contains("/assign")) {
					LOG.info("Succesfully got a list of assignments: " 
							+ event.getChildren().size() 
							+ " tasks");
					/*
					 * Delete the assignments of the absent worker
					 */
					for(String task : event.getChildren()){
						deleteAssignment(event.getPath() + "/" + task);
					}
					/*
					 * Delete the znode representing the absent worker
					 * in the assignments.
					 */
					deleteAssignment(event.getPath());
					/*
					 * Reassign the tasks.
					 */
					assignTasks(event.getChildren());
				} else {
					LOG.warn("Unexpected event: " + event.getPath());
				}
			
				break;
			case CREATE:
				/*
				 * Result of a create operation when assigning
				 * a task.
				 */
				if(event.getPath().contains("/assign")) {
					LOG.info("Task assigned correctly: " + event.getName());
					deleteTask(event.getPath().substring(event.getPath().lastIndexOf('-') + 1));
				}
				break;
			case DELETE:
				/*
				 * We delete znodes in two occasions:
				 * 1- When reassigning tasks due to a faulty worker;
				 * 2- Once we have assigned a task, we remove it from
				 *    the list of pending tasks. 
				 */
				if(event.getPath().contains("/tasks")) {
					LOG.info("Result of delete operation: " + event.getResultCode() + ", " + event.getPath());
				} else if(event.getPath().contains("/assign")) {
					LOG.info("Task correctly deleted: " + event.getPath());
					break;
				}
				break;
			case WATCHED:
				// There is no case implemented currently.
				break;
			default:
				LOG.error("Default case: " + event.getType());
			}
		} catch (Exception e) {
			LOG.error("Exception while processing event.", e);
			try{
				close();
			} catch (IOException ioe) {
				LOG.error("IOException while closing.", ioe);
			}
		}
	};
};
```

```java
client = CuratorFrameworkFactory.newClient(hostPort, retryPolicy);
// 注册监听器：
client.getCuratorListenable().addListener(masterListener);
```

还有一类比较特殊的监听器，这类监听器负责处理后台工作线程捕获的异常时的错误报告，该类监听器提供了底层细节的处理，
不过，也许你在你的应用程序中需要处理这类问题。当应用程序需要处理这些问题时，就必须实现另一个监听器：

```java
UnhandledErrorListener errorsListener = new UnhandledErrorListener() {
    public void unhandledError(String message, Throwable e) {
		LOG.error("Unrecoverable error: " + message, e);
        try {
            close();
        } catch (IOException ioe) {
            LOG.warn( "Exception when closing.", ioe );
        }
    }
};
client.getUnhandledErrorListenable().addListener(errorsListener);
```

* 之前采用链式调用和回调方法，而且每个回调方法都需要提供一个不同的回调实现，
* 而在Curator实例中，回调方法或监视点通知这些细节均被封装为Event类，这也是更适合使用一个事件处理器实现方式。

### Curator中状态的转换

在Curator中暴露了与ZooKeeper不同的一组状态，比如SUSPENDED状态，还有Curator使用LOST来表示会话过期的状态。

Curator连接状态机模型：

![Curator连接状态机模型](/static/img/2018-08-06-ZooKeeper/2018-08-13-16-14-40.png)

当处理状态的转换时，建议将所有主节点操作请求暂停，因为并不知道ZooKeeper客户端能否在会话过期前重新连接，
即使ZooKeeper客户端重新连接成功，也可能不再是主要主节点的角色，因此谨慎处理连接丢失的情况，对应用程序更加安全。

并未涉及的状态还有一个READ_ONLY状态，当ZooKeeper集群启用了只读模式，客户端所连接的服务器就会进入只读模式中，此时的连接状态也将进入只读模式。
服务器转换到只读模式后，该服务器就会因隔离问题而无法与其他服务器共同形成仲裁的最低法定数量，
当连接状态为只读模式，客户端也将漏掉此时发生的任何更新操作，因为如果集群中存在一个子集的服务器数量，可以满足仲裁最低法定数量，
并可以接收到客户端的对ZooKeeper的更新操作，还是会发生ZooKeeper的更新，也许这个子集的服务器会持续运行很久（ZooKeeper无法控制这种情况），那么漏掉的更新操作可能会无限多。
漏掉更新操作的结果可能会导致应用程序的不正确的操作行为，所以，强烈建议启用该模式前仔细考虑其后果。

_只读模式并不是Curator所独有的功能，而是通过ZooKeeper启用该选项。_

### 两种边界情况

有两种有趣的错误场景，在Curator中都可以处理得很好：

* 第一种是在有序节点的创建过程中发生的错误情况的处理；
* 第二种为删除一个节点时的错误处理。

#### 有序节点的情况

如果客户端所连接的服务器崩溃了，但还没来得及返回客户端所创建的有序节点的节点名称（即节点序列号），或者客户端只是连接丢失，
客户端没接收到所请求操作的响应信息，结果，客户端并不知道所创建的znode节点路径名称。

为了解决这个问题，CreateBuilder提供了一个withProtection方法来通知Curator客户端，在创建的有序节点前添加一个唯一标识符，
如果create操作失败了，客户端就会开始重试操作，而重试操作的一个步骤就是验证是否存在一个节点包含这个唯一标识符。

#### 删除节点的保障

如果客户端在执行delete操作时，与服务器之间的连接丢失，客户端并不知道delete操作是否成功执行。
如果一个znode节点删除与否表示某些特殊情况，例如，表示一个资源处于锁定状态，因此确保该节点删除才能确保资源的锁定被释放，以便可以再次使用。

Curator客户端中提供了一个方法，对应用程序的delete操作的执行提供了保障，Curator客户端会重新执行操作，直到成功为止，或Curator客户端实例不可用时。
使用该功能，只需要使用DeleteBuilder接口中定义的guaranteed方法。

### 菜谱

主节点例子的实现中，用到了三种菜谱：LeaderLatch、LeaderSelector和PathChildrenCache。

#### 群首闩

可以在应用程序中使用群首闩（leader latch）这个原语进行主节点选举的操作。

```java
leaderLatch = new LeaderLatch(client, "/master", myId);
```

LeaderLatch的构造函数中，需要传入一个Curator框架客户端的实例，一个用于表示集群管理节点的群组的ZooKeeper路径，以及一个表示当前主节点的标识符。

为了在Curator客户端获得或失去管理权时能够进行回调处理操作，需要注册一个LeaderLatchListener接口的实现，该接口中有两个方法：isLeader和notLeader。

```java
@Override
public void isLeader() {
	/*
	 * Start workersCache，缓存列表实例，确保有可以分配任务的从节点
	 */
	try {
		workersCache.getListenable().addListener(workersCacheListener);
		workersCache.start();
		(new RecoveredAssignments(client.getZookeeperClient().getZooKeeper())).recover(new RecoveryCallback() {
			@Override
			public void recoveryComplete(int rc, List<String> tasks) {
				try {
					if (rc == RecoveryCallback.FAILED) {
						LOG.warn("Recovery of assigned tasks failed.");
					} else {
						LOG.info("Assigning recovered tasks");
						recoveryLatch = new CountDownLatch(tasks.size());
						// 发现之前的主节点没有分配完的任务，继续分配
						assignTasks(tasks);
					}
					// 实现了一个任务分配的屏障，这样就可以在开始分配新任务前，等待已恢复的任务的分配完成，
					// 如果不这样做，新的主节点会再次分配所有已恢复的任务。
					// 启动了一个单独的线程进行处理，以便不会锁住ZooKeeper客户端回调线程的运行。
					new Thread(new Runnable() {
						public void run() {
							try {
								/*
								 * Wait until recovery is complete
								 */
								recoveryLatch.await();
								/*
								 * Starts tasks cache，主节点分配完成回复任务的分配操作，开始执行新任务的分配
								 */
								tasksCache.getListenable().addListener(tasksCacheListener);
								tasksCache.start();
							} catch (Exception e) {
								LOG.warn("Exception while assigning and getting tasks.", e);
							}
						}
					}).start();
				} catch (Exception e) {
					LOG.error("Exception while executing the recovery callback", e);
				}
			}
		});
	} catch (Exception e) {
		LOG.error("Exception when starting leadership", e);
	}
}
@Override
public void notLeader() {
	LOG.info("Lost leadership");
	try {
		close();
	} catch (IOException e) {
		LOG.warn("Exception while closing", e);
	}
}
public void runForMaster() throws Exception {
	/*
	 * Register listeners
	 */
	client.getCuratorListenable().addListener(masterListener);
	client.getUnhandledErrorListenable().addListener(errorsListener);
	/*
	 * Start master election
	 */
	LOG.info("Starting master selection: " + myId);
	leaderLatch.addListener(this);
	leaderLatch.start();
}
```

对于notLeader方法，会在主节点失去管理权时进行调用，在本例中，只是简单地关闭了所有对象实例，对这个例子来说，这些操作已经足够了。
在实际的应用程序中，你也许还需要进行某些状态的清理操作并等待再次成为主节点。如果LeaderLatch对象没有关闭，Curator客户端有可能再次获得管理权。

#### 群首选举器

选举主节点时还可以使用的另一个菜谱为LeaderSelector。LeaderSelector和LeaderLatch之间主要区别在于使用的监听器接口不同，
其中LeaderSelector使用了LeaderSelectorListener接口，该接口中定义了takeLeadership方法，并继承了stateChanged方法，可以在的应用程序中使用群首闩原语来进行一个主节点的选举操作。

```java
leaderSelector = new LeaderSelector(client, "/master", this);
```

LeaderSelector的构造函数中，接受一个Curator框架客户端实例，一个表示该主节点所参与的集群管理节点群组的ZooKeeper路径，以及一个LeaderSelectorListener接口的实现类的实例。

集群管理节点群组表示所有参与主节点选举的Curator客户端。在LeaderSelectorListener的实现中必须包含takeLeadership方法和stateChanged方法，其中takeLeadership方法用于获取管理权。

```java
private CountDownLatch leaderLatch = new CountDownLatch(1);
private CountDownLatch closeLatch = new CountDownLatch(1);
@Override
public void takeLeadership(CuratorFramework client) throws Exception {
	LOG.info("Mastership participants: " + myId + ", " + leaderSelector.getParticipants());
	/*
	 * Start workersCache
	 */
	workersCache.getListenable().addListener(workersCacheListener);
	workersCache.start();
	(new RecoveredAssignments(client.getZookeeperClient().getZooKeeper())).recover(new RecoveryCallback() {
		public void recoveryComplete(int rc, List<String> tasks) {
			try {
				if (rc == RecoveryCallback.FAILED) {
					LOG.warn("Recovery of assigned tasks failed.");
				} else {
					LOG.info("Assigning recovered tasks");
					recoveryLatch = new CountDownLatch(tasks.size());
					assignTasks(tasks);
				}
				new Thread(new Runnable() {
					public void run() {
						try {
							/*
							 * Wait until recovery is complete
							 */
							recoveryLatch.await();
							/*
							 * Starts tasks cache
							 */
							tasksCache.getListenable().addListener(tasksCacheListener);
							tasksCache.start();
						} catch (Exception e) {
							LOG.warn("Exception while assigning and getting tasks.", e);
						}
					}
				}).start();
				/*
				 * Decrements latch，等待获取管理权，处理完上次未处理的任务后开始新任务
				 */
				leaderLatch.countDown();
			} catch (Exception e) {
				LOG.error("Exception while executing the recovery callback", e);
			}
		}
	});
	/*
	 * This latch is to prevent this call from exiting. If we exit, then
	 * we release mastership.
	 */
	// 对于主节点来说，如果想要释放管理权只能退出takeLeadership方法，所以需要通过某些锁等机制来阻止该方法的退出
	// 在退出主节点时通过递减闩（latch）值来实现。
	closeLatch.await();
}
```

```java
// 不需要注册一个监听器（因为在构造函数中已经注册了监听器）
public void runForMaster() {
	/*
	 * Register listeners
	 */
	client.getCuratorListenable().addListener(masterListener);
	client.getUnhandledErrorListenable().addListener(errorsListener);
	/*
	 * Starting master
	 */
	LOG.info("Starting master selection: " + myId);
	leaderSelector.setId(myId);
	leaderSelector.start();
}
```

另外还需要给这个主节点一个任意的标识符。

虽然在本例中并未实现，但可以设置群首选择器在失去管理权后自动重新排队（LeaderSelector.autoRequeue）。
重新排队意味着该客户端会一直尝试获取管理权，并在获得管理权后执行takeLeadership方法。

作为LeaderSelectorListener接口实现的一部分，还实现了一个处理连接状态变化的方法：

```java
@Override
public void stateChanged(CuratorFramework client, ConnectionState newState) {
	switch (newState) {
		case CONNECTED:
			//Nothing to do in this case.
			break;
		case RECONNECTED:
			// Reconnected, so I should
			// still be the leader.
			// 所有操作均需要通过ZooKeeper集群实现，
			// 因此，如果连接丢失，主节点也就无法先进行任何操作请求，因此在这里最好什么都不做。
			break;
		case SUSPENDED:
			LOG.warn("Session suspended");
			break;
		case LOST:
			// 关闭程序
			try {
				close();
			} catch (IOException e) {
				LOG.warn("Exception while closing", e);
			}
			break;
		case READ_ONLY:
			// We ignore this case
			break;
	}
}

```

#### 子节点缓存器

使用该类保存从节点的列表和任务列表，该缓存器负责保存一份子节点列表的本地拷贝，并会在该列表发生变化时通知。

_注意，因为时间问题，也许在某些特定时间点该缓存的数据集合与ZooKeeper中保存的信息并不一致，但这些变化最终都会反映到ZooKeeper中。_

为了处理每一个缓存器实例的变化情况，需要一个PathChildrenCacheListener接口的实现类，该接口中只有一个方法childEvent。
对于从节点信息的列表，只关心从节点离开的情况，因为需要重新分配已经分给这些节点的任务，而列表中添加信息对于分配新任务更加重要：

```java
PathChildrenCacheListener workersCacheListener = new PathChildrenCacheListener() {
	@Override
	public void childEvent(CuratorFramework client, PathChildrenCacheEvent event) {
		if (event.getType() == PathChildrenCacheEvent.Type.CHILD_REMOVED) {
			/*
			 * Obtain just the worker's name
			 */
			try {
				getAbsentWorkerTasks(event.getData().getPath().replaceFirst("/workers/", ""));
			} catch (Exception e) {
				LOG.error("Exception while trying to re-assign tasks", e);
			}
		}
	}
};
private void getAbsentWorkerTasks(String worker) throws Exception {
	/*
	 * Get assigned tasks
	 */
	client.getChildren().inBackground().forPath("/assign/" + worker);
}
```

对于任务列表，通过列表增加的情况来触发任务分配的过程：

```java
PathChildrenCacheListener tasksCacheListener = new PathChildrenCacheListener() {
	public void childEvent(CuratorFramework client, PathChildrenCacheEvent event) {
		if (event.getType() == PathChildrenCacheEvent.Type.CHILD_ADDED) {
			try {
				assignTask(event.getData().getPath().replaceFirst("/tasks/", ""),
						event.getData().getData());
			} catch (Exception e) {
				LOG.error("Exception when assigning task.", e);
			}
		}
	}
};
```

_注意，这里假设至少有一个可用的从节点可以分配任务给它，当前没有可用的从节点时，需要暂停任务分配，并保存列表信息的增加信息，以便在从节点列表中新增可用从节点时可以将这些没有分配的任务进行分配。_

### 总结

Curator实现了一系列很不错的ZooKeeper API的扩展，将ZooKeeper的复杂性进行了抽象，并实现了在实际生产环境中经验的最佳实践和社区讨论的某些特性。

## ZooKeeper内部原理

选择某一个服务器，称之为群首（leader）。其他服务器追随群首，被称为追随者（follower）。

群首作为中心点处理所有对ZooKeeper系统变更的请求，它就像一个定序器，建立了所有对ZooKeeper状态的更新的顺序，
追随者接收群首所发出更新操作请求，并对这些请求进行处理，以此来保障状态更新操作不会发生碰撞。

群首和追随者组成了保障状态变化有序的核心实体，同时还存在第三类服务器，称为观察者（observer）。
观察者不会参与决策哪些请求可被接受的过程，只是观察决策的结果，观察者的设计只是为了系统的可扩展性。

### 请求、事务和标识符

ZooKeeper服务器会在本地处理只读请求（exists、getData和getChildren）。
一个服务器接收到客户端的getData请求，服务器读取该状态信息，并将这些信息返回给客户端。

因为服务器会在本地处理请求，所以ZooKeeper在处理以只读请求为主要负载时，性能会很高。
还可以增加更多的服务器到ZooKeeper集群中，处理更多的读请求，大幅提高整体处理能力。

那些会改变ZooKeeper状态的客户端请求（create、delete和setData）将会被转发给群首，群首执行相应的请求，并形成状态的更新，称为事务（transaction）。
请求表示源自于客户端发起的操作，而事务则包含了对应请求处理而改变ZooKeeper状态所需要执行的步骤。

假如一个客户端提交了一个对/z节点的setData请求，setData将会改变该znode节点数据信息，并会增加该节点的版本号，
因此，对于这个请求的事务包括了两个重要字段：节点中新的数据字段值和该节点新的版本号。  
当处理该事务时，服务端将会用事务中的数据信息来替换/z节点中原来的数据信息，并会用事务中的版本号更新该节点，而不是增加版本号的值。

一个事务为一个单位，也就是说所有的变更处理需要以原子方式执行。

ZooKeeper集群以事务方式运行，并确保所有的变更操作以原子方式被执行，同时不会被其他事务所干扰。
在ZooKeeper中，并不存在传统的关系数据库中所涉及的回滚机制，而是确保事务的每一步操作都互不干扰。
在很长的一段时间里，ZooKeeper所采用的设计方式为，在每个服务器中启动一个单独的线程来处理事务，通过单独的线程来保障事务之间的顺序执行互不干扰。
最近，ZooKeeper增加了多线程的支持，以便提高事务处理的速度。

同时一个事务还具有幂等性，也就是说，可以对同一个事务执行两次，得到的结果还是一样的，
甚至还可以对多个事务执行多次，同样也会得到一样的结果，前提是确保多个事务的执行顺序每次都是一样的。
事务的幂等性可以让在进行恢复处理时更加简单。

当群首产生了一个事务，就会为该事务分配一个标识符，称之为ZooKeeper会话ID（zxid），通过Zxid对事务进行标识，就可以按照群首所指定的顺序在各个服务器中按序执行。
服务器之间在进行新的群首选举时也会交换zxid信息，这样就可以知道哪个无故障服务器接收了更多的事务，并可以同步他们之间的状态信息。

zxid为一个long型（64位）整数，分为两部分：时间戳（epoch）部分和计数器（counter）部分。每个部分为32位。
通过该zab协议来广播各个服务器的状态变更信息会使用时间戳和计数器。

### 群首选举

群首为集群中的服务器选择出来的一个服务器，并会一直被集群所认可。
设置群首的目的是为了对客户端所发起的ZooKeeper状态变更请求进行排序，包括：create、setData和delete操作。
群首将每一个请求转换为一个事务，如前一节中所介绍，将这些事务发送给追随者，确保集群按照群首确定的顺序接受并处理这些事务。

为了了解管理权的原理，一个服务器必须被仲裁的法定数量的服务器所认可。
法定数量必须集群数量是能够交错在一起，以避免脑裂问题（split brain）：即两个集合的服务器分别独立的运行，形成了两个集群。
这种情况将导致整个系统状态的不一致性，最终客户端也将根据其连接的服务器而获得不同的结果。

选举并支持一个群首的集群服务器数量必须至少存在一个服务器进程的交叉，使用属于仲裁（quorum）来表示这样一个进程的子集，仲裁模式要求服务器之间两两相交。

**进展**

> 一组服务器达到仲裁法定数量是必需条件，如果足够多的服务器永久性地退出，无法达到仲裁法定数量，ZooKeeper也就无法取得进展。
> 即使服务器退出后再次启动也可以，但必须保证仲裁的法定数量的服务器最终运行起来。

每个服务器启动后进入LOOKING状态，开始选举一个新的群首或查找已经存在的群首，如果群首已经存在，其他服务器就会通知这个新启动的服务器，
告知哪个服务器是群首，与此同时，新的服务器会与群首建立连接，以确保自己的状态与群首一致。

如果集群中所有的服务器均处于LOOKING状态，这些服务器之间就会进行通信来选举一个群首，通过信息交换对群首选举达成共识的选择。
在本次选举过程中胜出的服务器将进入LEADING状态，而集群中其他服务器将会进入FOLLOWING状态。

对于群首选举的消息，称之为群首选举通知消息（leader election notifications），或简单地称为通知（notifications）。
该协议非常简单，当一个服务器进入LOOKING状态，就会发送向集群中每个服务器发送一个通知消息，该消息中包括该服务器的投票（vote）信息，投票中包含服务器标识符（sid）和最近执行的事务的zxid信息，
比如，一个服务器所发送的投票信息为（1，5），表示该服务器的sid为1，最近执行的事务的zxid为5（出于群首选举的目的，zxid只有一个数字，而在其他协议中，zxid则有时间戳epoch和计数器组成）。

当一个服务器收到一个投票信息，该服务器将会根据以下规则修改自己的投票信息：

1. 将接收的voteId和voteZxid作为一个标识符，并获取接收方当前的投票中的zxid，用myZxid和mySid表示接收方服务器自己的值。
2. 如果（voteZxid>myZxid）或者（voteZxid=myZxid且voteId>mySid），保留当前的投票信息。
3. 否则，修改自己的投票信息，将voteZxid赋值给myZxid，将voteId赋值给mySid。

简而言之，只有最新的服务器将赢得选举，因为其拥有最近一次的zxid。这样做将会简化群首崩溃后重新仲裁的流程。
如果多个服务器拥有最新的zxid值，其中的sid值最大的将赢得选举。

当一个服务器接收到仲裁数量的服务器发来的投票都一样时，就表示群首选举成功，如果被选举的群首为某个服务器自己，该服务器将会开始行使群首角色，
否则就成为一个追随者并尝试连接被选举的群首服务器。

_注意，并未保证追随者必然会成功连接上被选举的群首服务器，比如，被选举的群首也许此时崩溃了。一旦连接成功，追随者和群首之间将会进行状态同步，在同步完成后，追随者才可以处理新的请求。_

**查找群首**

> 在ZooKeeper中对应的实现选举的Java类为QuorumPeer，其中的run方法实现了服务器的主要工作循环。
> 当进入LOOKING状态，将会执行lookForLeader方法来进行群首的选举，该方法主要执行刚刚所讨论的协议，该方法返回前，在该方法中会将服务器状态设置为LEADING状态或FOLLOWING状态，当然还可能为OBSERVING状态。
> 如果服务器成为群首，就会创建一个Leader对象并运行这个对象，如果服务器为追随者，就会创建一个Follower对象并运行。

协议的执行过程：

三个服务器分别以不同的初始投票值开始，其投票值取决于该服务器的标识符和其最新的zxid。
每个服务器会收到另外两个服务器发送的投票信息，在第一轮之后，服务器s2和服务器s3将会改变其投票值为（1，6），
之后服务器服务器s2和服务器s3在改变投票值之后会发送新的通知消息，
在接收到这些新的通知消息后，每个服务器收到的仲裁数量的通知消息拥有一样的投票值，最后选举出服务器s1为群首。

![群首选举过程的示例](/static/img/2018-08-06-ZooKeeper/2018-08-13-22-06-58.png)

另一种情况的例子：

服务器s2做出了错误判断，选举了另一个服务器s3而不是服务器s1，虽然s1的zxid值更高，但在从服务器s1向服务器s2传送消息时发生了网络故障导致长时间延迟，
与此同时，服务器s2选择了服务器s3作为群首，最终，服务器s1和服务器s3组成了仲裁数量（quorum），并将忽略服务器s2。

![消息交错导致一个服务器选择了另一个群首](/static/img/2018-08-06-ZooKeeper/2018-08-13-22-14-02.png)

虽然服务器s2选择了另一个群首，但并未导致整个服务发生错误，因为服务器s3并不会以群首角色响应服务器s2的请求，
最终服务器s2将会在等待被选择的群首s3的响应时而超时，并开始再次重试。再次尝试，意味着在这段时间内，服务器s2无法处理任何客户端的请求，这样做并不可取。

如果让服务器s2在进行群首选举时多等待一会，它就能做出正确的判断。

![群首选举时的长延迟](/static/img/2018-08-06-ZooKeeper/2018-08-13-22-16-34.png)

很难确定服务器需要等待多长时间，在现在的实现中，默认的群首选举的实现类为FastLeaderElection，其中使用固定值200ms（常量finalizeWait），
这个值比在当今数据中心所预计的长消息延迟（不到1毫秒到几毫秒的时间）要长得多，但与恢复时间相比还不够长。
万一此类延迟（或任何其他延迟）时间并不是很长，一个或多个服务器最终将错误选举一个群首，从而导致该群首没有足够的追随者，那么服务器将不得不再次进行群首选举。
错误地选举一个群首可能会导致整个恢复时间更长，因为服务器将会进行连接以及不必要的同步操作，并需要发送更多消息来进行另一轮的群首选举。

**快速群首选举的快速指的是什么？**

> 如果你想知道为什么称当前默认的群首选举算法为快速算法，这个问题有历史原因。
> 最初的群首选举算法的实现采用基于拉取式的模型，一个服务器拉取投票值的间隔大概为1秒，该方法增加了恢复的延迟时间，相比较现在的实现方式，可以更加快速地进行群首选举。

如果想实现一个新的群首选举的算法，需要实现一个quorum包中的Election接口。为了可以让用户自己选择群首选举的实现，代码中使用了简单的整数标识符（请查看代码中QuorumPeer.createElectionAlgorithm（）），
另外两种可选的实现方式为LeaderElection类和AuthFastLeaderElection类，但在版本3.4.0中，这些类已经标记为弃用状态，因此，在未来的发布版本中，你可能不会再看到这些类。

### Zab：状态更新和广播协议

在接收到一个写请求操作后，追随者会将请求转发给群首，群首将探索性地执行该请求，并将执行结果以事务的方式对状态更新进行广播。
一个事务中包含服务器需要执行变更的确切操作，当事务提交时，服务器就会将这些变更反馈到数据树上，其中数据树为ZooKeeper用于保存状态信息的数据结构（请参考DataTree类）。

需要面对的问题便是服务器如何确认一个事务是否已经提交，由此引入了所采用的协议：Zab：ZooKeeper原子广播协议（ZooKeeper Atomic Broadcast protocol）。

通过该协议提交一个事务非常简单，类似于一个两阶段提交：

1. 群首向所有追随者发送一个PROPOSAL消息p。
2. 当一个追随者接收到消息p后，会响应群首一个ACK消息，通知群首其已接受该提案（proposal）。
3. 当收到仲裁数量的服务器发送的确认消息后（该仲裁数包括群首自己），群首就会发送消息通知追随者进行提交（COMMIT）操作。

![提交提案的常规消息模式](/static/img/2018-08-06-ZooKeeper/2018-08-13-22-36-57.png)

在应答提案消息之前，追随者还需要执行一些检查操作。追随者将会检查所发送的提案消息是否属于其所追随的群首，并确认群首所广播的提案消息和提交事务消失的顺序正确。

Zab保障了以下几个重要属性：

* 如果群首按顺序广播了事务T和事务T，那么每个服务器在提交T'事务前保证事务T已经提交完成。
* 如果某个服务器按照事务T、事务T的顺序提交事务，所有其他服务器也必然会在提交事务T前提交事务T。

第一个属性保证事务在服务器之间的传送顺序的一致，而第二个竖向地保证服务器不会跳过任何事务。
假设事务为状态变更操作，每个状态变更操作又依赖前一个状态变更操作的结果，如果跳过事务就会导致结果的不一致性，而两阶段提交保证了事务的顺序。
Zab在仲裁数量服务器中记录了事务，集群中仲裁数量的服务器需要在群首提交事务前对事务达成一致，而且追随者也会在硬盘中记录事务的确认信息。

事务在某些服务器上可能会终结，而其他服务器上却不会，因为在写入事务到存储中时，服务器也可能发生崩溃。
无论何时，只要仲裁条件达成并选举了一个新的群首，ZooKeeper都可以将所有服务器的状态更新到最新。

但是，ZooKeeper自始至终并不总是有一个活动的群首，因为群首服务器也可能崩溃，或短时间地失去连接，此时，其他服务器需要选举一个新的群首以保证系统整体仍然可用。
其中时间戳（epoch）的概念代表了管理权随时间的变化情况，一个时间戳表示了某个服务器行使管理权的这段时间，
在一个时间戳内，群首会广播提案消息，并根据计数器（counter）识别每一个消息。zxid的第一个元素为时间戳信息，因此每个zxid可以很容易地与事务被创建时间戳相关联。

时间戳的值在每次新群首选举发生的时候便会增加。同一个服务器成为群首后可能持有不同的时间戳信息，
但从协议的角度出发，一个服务器行使管理权时，如果持有不同的时间戳，该服务器就会被认为是不同的群首。

如果服务器s成为群首并且持有的时间戳为4，而当前已经建立的群首的时间戳为6，集群中的追随者会追随时间戳为6的群首s，处理群首在时间戳6之后的消息。
当然，追随者在恢复阶段也会接收时间戳4到时间戳6之间的提案消息，之后才会开始处理时间戳为6之后的消息，而实际上这些提案消息是以时间戳6'的消息来发送的。

在仲裁模式下，记录已接收的提案消息非常关键，这样可以确保所有的服务器最终提交了被某个或多个服务已经提交完成的事务，即使群首在此时发生了故障。

实现这个广播协议所遇到最多的困难在于群首并发存在情况的出现，这种情况并不一定是脑裂场景。
多个并发的群首可能会导致服务器提交事务的顺序发生错误，或者直接跳过了某些事务。为了阻止系统中同时出现两个服务器自认为自己是群首的情况是非常困难的，
时间问题或消息丢失都可能导致这种情况，因此广播协议并不能基于以上假设。

为了解决这个问题，Zab协议提供了以下保障：

* 一个被选举的群首确保在提交完所有之前的时间戳内需要提交的事务，之后才开始广播新的事务。
* 在任何时间点，都不会出现两个被仲裁支持的群首。

为了实现第一个需求，群首并不会马上处于活动状态，直到确保仲裁数量的服务器认可这个群首新的时间戳值。
一个时间戳的最初状态必须包含所有的之前已经提交的事务，或者某些已经被其他服务器接受，但尚未提交完成的事务。  
这一点非常重要，在群首进行时间戳e的任何新的提案前，必须保证自时间戳开始值到时间戳e－1内的所有提案被提交。
如果一个提案消息处于时间戳`e'<e`，在群首处理时间戳e的第一个提案消息前没有提交之前的这个提案，那么旧的提案将永远不会被提交。

对于第二个需求有些棘手，因为并不能完全阻止两个群首独立地运行。
假如一个群首l管理并广播事务，在此时，仲裁数量的服务器Q判断群首l已经退出，并开始选举了一个新的群首l'，
假设在仲裁机构Q放弃群首l时有一个事务T正在广播，而且仲裁机构Q的一个严格的子集记录了这个事务T，在群首l'被选举完成后，
在仲裁机构Q之外服务器也记录了这个事务T，为事务T形成一个仲裁数量，在这种情况下，事务T在群首l'被选举后会进行提交。
这并不是个bug，Zab协议保证T作为事务的一部分被群首l'提交，确保群首l'的仲裁数量的支持者中至少有一个追随者确认了该事务T，
其中的关键点在于群首l'和l在同一时刻并未获得足够的仲裁数量的支持者。

![群首发生重叠的情况](/static/img/2018-08-06-ZooKeeper/2018-08-13-22-58-19.png)

群首l为服务器s5，l'为服务器s3，仲裁机构由s1到s3组成，事务T的zxid为（1，1）。
在收到第二个确认消息之后，服务器s5成功向服务器s4发送了提交消息来通知提交事务。
其他服务器因追随服务器s3忽略了服务器s5的消息，注意服务器s3所了解的xzid为（1，1），因此它知道获得管理权后的事务点。

Zab保证新群首l'不会缺失（1，1）。
在新群首l'生效前，它必须学习旧的仲裁数量服务器之前接受的所有提议，并且保证这些服务器不会继续接受来自旧群首的提议。
此时，如果群首l还能继续提交提议，比如（1，1），这条提议必须已经被一个以上的认可了新群首的仲裁数量服务器所接受。
仲裁数量必须在一台以上的服务器之上有所重叠，这样群首l'用来提交的仲裁数量和新群首l使用的仲裁数量必定在一台以上的服务器上是一致的。
因此，l'将（1，1）加入自身的状态并传播给其跟随者。

在群首选举时，选择zxid最大的服务器作为群首。这使得ZooKeeper不需要将提议从追随者传到群首，而只需要将状态从群首传播到追随者。
假设有一个追随者接受了一条群首没有接受的提议。群首必须确保在和其他追随者同步之前已经收到并接受了这条提议。
但是，如果选择zxid最大的服务器，将可以完完全全跳过这一步，可以直接发送更新到追随者。

在时间戳发生转换时，Zookeeper使用两种不同的方式来更新追随者来优化这个过程：

* 如果追随者滞后于群首不多，群首只需要发送缺失的事务点。因为追随者按照严格的顺序接收事务点，这些缺失的事务点永远是最近的。这种更新在代码中被称之为DIFF。
* 如果追随者滞后很久，ZooKeeper将发送在代码中被称为SNAP的完整快照。

因为发送完整的快照会增大系统恢复的延时，发送缺失的事务点是更优的选择。可是当追随者滞后太远的情况下，只能选择发送完整快照。

群首发送给追随者的DIFF对应于已经存在于事务日志中的提议，而SNAP对应于群首拥有的最新有效快照。

**深入代码**

> 大部分Zab的代码存在于Leader、LearnerHandler和Follower。
> Leader和LearnerHandler的实例由群首服务器执行，而Follower的实例由追随者执行。
> Leader.lead和Follower.followLeader是两个重要的方法，他们在服务器在QuorumPeer中从LOOKING转换到LEADING或者FOLLOWING时得到调用。  
> 如果你对DIFF和SNAP的区别感兴趣，可以查看LearnerHandler.run的代码，其中包含了使用DIFF时如何决定发送哪条提议，以及关于如何持久化和发送快照的细节。

### 观察者

观察者和追随者之间有一些共同点。具体说来，他们提交来自群首的提议。不同于追随者的是，观察者不参与选举过程。
他们仅仅学习经由INFORM消息提交的提议。由于群首将状态变化发送给追随者和观察者，这两种服务器也都被称为学习者。

参与决定那条提议被提交的投票的服务器被称为PARTICIPANT服务器。一个PARTICIPANT服务器可以是群首也可以是追随者。而观察者则被称为OBSERVER服务器。

**深入INFORM消息**

> 因为观察者不参与决定提议接受与否的投票，群首不需要发送提议到观察者，群首发送给追随者的提交消息只包含zxid而不包含提议本身。
> 因此，仅仅发送提交消息给观察者并不能使其实施提议。这是使用INFORM消息的原因。INFORM消息本质上是包含了正在被提交的提议信息的提交消息。
> 
> 简单来说，追随者接受两种消息而观察者只接受一种消息。追随者从一次广播中获取提议的内容，并从接下来的一条提交消息中获取zxid。
> 相比之下，观察者只获取一条包含已提交提议的内容的INFORM消息。

引入观察者的一个主要原因是提高读请求的可扩展性。通过加入多个观察者，可以在不牺牲写操作的吞吐率的前提下服务更多的读操作。
写操作的吞吐率取决于仲裁数量的大小。如果加入更多的参与投票的服务器，将需要更大的仲裁数量，而这将减少写操作的吞吐率。
增加观察者也不是完全没有开销的。每一个新加入的观察者将对应于每一个已提交事务点引入的一条额外消息。然而，这个开销相对于增加参与投票的服务器来说小很多。

采用观察者的另外一个原因是进行跨多个数据中心的部署。
由于数据中心之间的网络链接延时，将服务器分散于多个数据中心将明显地降低系统的速度。
引入观察者后，更新请求能够先以高吞吐率和低延迟的方式在一个数据中心内执行，接下来再传播到异地的其他数据中心得到执行。  
观察者并不能消除数据中心之间的网络消息，因为观察者必须转发更新请求给群首并且处理INFORM消息。
不同的是，当参与的服务器处于同一个数据中心时，观察者保证提交更新必需的消息在数据中心内部得到交换。

### 服务器的构成

群首、追随者和观察者根本上都是服务器。
在实现服务器时使用的主要抽象概念是请求处理器。请求处理器是对处理流水线上不同阶段的抽象。每一个服务器实现了一个请求处理器的序列。
可以把一个处理器想象成添加到请求处理的一个元素。一条请求经过服务器流水线上所有处理器的处理后被称为得到完全处理。

**请求处理器**

> ZooKeeper代码里有一个叫RequestProcessor的接口。这个接口的主要方法是processRequest，它接受一个Request参数。
> 在一条请求处理器的流水线上，对相邻处理器的请求的处理通常通过队列现实解耦合。
> 当一个处理器有一条请求需要下一个处理器进行处理时，它将这条请求加入队列。
> 然后，它将处于等待状态直到下一个处理器处理完此消息。

#### 独立服务器

Zookeeper中最简单的流水线是独立服务器（ZeeKeeperServer类）。
它包含三种请求处理器：PrepRequestProcessor、SyncRequestProcessor和FinalRequestProcessor。

一个独立服务器的流水线：

![一个独立服务器的流水线](/static/img/2018-08-06-ZooKeeper/2018-08-14-22-06-04.png)

PrepRequestProcessor接受客户端的请求并执行这个请求，处理结果则是生成一个事务。
知道事务是执行一个操作的结果，该操作会反映到ZooKeeper的数据树上。事务信息将会以头部记录和事务记录的方式添加到Request对象中。
同时还要注意，只有改变ZooKeeper状态的操作才会产生事务，对于读操作并不会产生任何事务。因此，对于读请求的Request对象中，事务的成员属性的引用值则为null。

下一个请求处理器为SyncRequestProcessor。
SyncRequestProcessor负责将事务持久化到磁盘上。实际上就是将事务数据按顺序追加到事务日志中，并生成快照数据。

下一个处理器也是最后一个为FinalRequestProcessor。
如果Request对象包含事务数据，该处理器将会接受对ZooKeeper数据树的修改，否则，该处理器会从数据树中读取数据并返回给客户端。

#### 群首服务器

切换到仲裁模式时，服务器的流水线则有一些变化。

群首服务器的流水线（类LeaderZooKeeper）：

![群首服务器的流水线](/static/img/2018-08-06-ZooKeeper/2018-08-14-22-12-18.png)

第一个处理器同样是PrepRequestProcessor，而之后的处理器则为ProposalRequestProcessor。该处理器会准备一个提议，并将该提议发送给跟随者。
ProposalRequestProcessor将会把所有请求都转发给CommitRequestProcessor，而且，对于写操作请求，还会将请求转发给SyncRequestProcessor处理器。

SyncRequestProcessor处理器所执行的操作与独立服务器中的一样，即持久化事务到磁盘上。
执行完之后会触发AckRequestProcessor处理器，这个处理器是一个简单请求处理器，它仅仅生成确认消息并返回给自己。
在仲裁模式下，群首需要收到每个服务器的确认消息，也包括群首自己，而AckRequestProcessor处理器就负责这个。

在ProposalRequestProcessor处理器之后的处理器为CommitRequestProcessor。CommitRequestProcessor会将收到足够多的确认消息的提议进行提交。
实际上，确认消息是由Leader类处理的（Leader.processAck()方法），这个方法会将提交的请求加入到CommitRequestProcessor类中的一个队列中。这个队列会由请求处理器线程进行处理。

下一个处理器也是最后一个为FinalRequestProcessor处理器，它的作用与独立服务器一样。FinalRequestProcessor处理更新类型的请求，并执行读取请求。

在FinalRequestProcessor处理器之前还有一个简单的请求处理器，这个处理器会从提议列表中删除那些待接受的提议，这个处理器的名字叫ToBeAppliedRequestProcessor。
待接受请求列表包括那些已经被仲裁法定人数所确认的请求，并等待被执行。群首使用这个列表与追随者之间进行同步，并将收到确认消息的请求加入到这个列表中。
之后ToBeAppliedRequestProcessor处理器就会在FinalRequestProcessor处理器执行后删除这个列表中的元素。  
只有更新请求才会加入到待接受请求列表中，然后由ToBeAppliedRequest-Processor处理器从该列表移除。
ToBeAppliedRequestProcessor处理器并不会对读取请求进行任何额外的处理操作，而是由FinalRequestProcessor处理器进行操作。

#### 追随者和观察者服务器

追随者（FollowerRequestProcessor类），一个追随者服务器中会用到的请求处理器并不是一个单一序列的处理器，
而且输入也有不同形式：客户端请求、提议、提交事务。

追随者服务器的流水线，通过箭头来将标识追随者处理的不同路径：

![追随者服务器的流水线](/static/img/2018-08-06-ZooKeeper/2018-08-14-22-22-21.png)

首先从FollowerRequestProcessor处理器开始，该处理器接收并处理客户端请求。
FollowerRequestProcessor处理器之后转发请求给CommitRequestProcessor，同时也会转发写请求到群首服务器。
CommitRequestProcessor会直接转发读取请求到FinalRequestProcessor处理器，而且对于写请求，CommitRequestProcessor在转发给FinalRequestProcessor处理器之前会等待提交事务。

当群首接收到一个新的写请求操作时，直接地或通过其他追随者服务器来生成一个提议，之后转发到追随者服务器。
当收到一个提议，追随者服务器会发送这个提议到SyncRequestProcessor处理器，SendRequestProcessor会向群首发送确认消息。
当群首服务器接收到足够确认消息来提交这个提议时，群首就会发送提交事务消息给追随者（同时也会发送INFORM消息给观察者服务器）。
当接收到提交事务消息时，追随者就通过CommitRequestProcessor处理器进行处理。

为了保证执行的顺序，CommitRequestProcessor处理器会在收到一个写请求处理器时暂停后续的请求处理。
这就意味着，在一个写请求之后接收到的任何读取请求都将被阻塞，直到读取请求转给CommitRequestProcessor处理器。
通过等待的方式，请求可以被保证按照接收的顺序来被执行。

对于观察者服务器的请求流水线（ObserverZooKeeperServer类）与追随者服务器的流水线非常相似。
但是因为观察者服务器不需要确认提议消息，因此观察者服务器并不需要发送确认消息给群首服务器，也不用持久化事务到硬盘。
对于观察者服务器是否需要持久化事务到硬盘，以便加速观察者服务器的恢复速度，这样的讨论正在进行中，因此对于以后的ZooKeeper版本也会会有这一个功能。

### 本地存储

SyncRequestProcessor处理器就是用于在处理提议是写入这些日志和快照。

#### 日志和磁盘的使用

服务器通过事务日志来持久化事务。在接受一个提议时，一个服务器（追随者或群首服务器）就会将提议的事务持久化到事物日志中，
该事务日志保存在服务器的本地磁盘中，而事务将会按照顺序追加其后。服务器会时不时地滚动日志，即关闭当前文件并打开一个新的文件。

因为写事务日志是写请求操作的关键路径，因此ZooKeeper必须有效处理写日志问题。
一般情况下追加文件到磁盘都会有效完成，但还有一些情况可以使ZooKeeper运行的更快，组提交和补白。

组提交（GroupCommits）是指在一次磁盘写入时追加多个事务。这将使持久化多个事物只需要一次磁道寻址的开销。

关于持久化事务到磁盘，还有一个重要说明：  
现代操作系统通常会缓存脏页（Dirty Page），并将它们异步写入磁盘介质。
然而，需要在继续之前，确保事务已经被持久化。因此需要冲刷（Flush）事务到磁盘介质。冲刷在这里就是指告诉操作系统将脏页写入磁盘，并在操作完成后返回。
因为在SyncRequestProcessor处理器中持久化事务，所以这个处理器同时也会负责冲刷。在SyncRequestProcessor处理器中当需要冲刷事务到磁盘时，事实上是冲刷的是所有队列中的事务，以实现组提交的优化。
如果队列中只有一个事务，这个处理器依然会执行冲刷。该处理器并不会等待更多的事务进入队列，因为这样做会增加执行操作的延时。代码参考可以查看SyncRequestProcessor.run()方法。

**磁盘写缓存**

> 服务器只有在强制将事务写入事务日志之后才确认对应的提议。更准确一点，服务器调用ZKDatabase的commit方法，这个方法最终会调用FileChannel.force。
> 这样，服务器保证在确认事务之前已经将它持久化到磁盘中。不过，有一个需要注意的地方，现代的磁盘一般有一个缓存用于保存将要写到磁盘的数据。
> 如果写缓存开启，force调用在返回后并不能保证数据已经写入介质中。实际上，它可能还在写缓存中。
> 为了保证在FileChannel.force()方法返回后，写入的数据已经在介质上，磁盘写缓存必须关闭。不同的操作系统有不同的关闭方式。

补白（padding）是指在文件中预分配磁盘存储块。这样做，对于涉及存储块分配的文件系统元数据的更新，就不会显著影响文件的顺序写入操作。
假如需要高速向日志中追加事务，而文件中并没有原先分配存储块，那么无论何时在写入操作到达文件的结尾，文件系统都需要分配一个新存储块。
而通过补白至少可以减少两次额外的磁盘寻址开销：一次是更新元数据；另一次是返回文件。

_为了避免受到系统中其他写操作的干扰，强烈推荐你将事务日志写入到一个独立磁盘，将第二块磁盘用于操作系统文件和快照文件。_

#### 快照

快照是ZooKeeper数据树的拷贝副本，每一个服务器会经常以序列化整个数据树的方式来提取快照，并将这个提取的快照保存到文件中。服务器在进行快照时不需要进行协作，也不需要暂停处理请求。
因为服务器在进行快照时还会继续处理请求，所以当快照完成时，数据树可能又发生了变化，称这样的快照是模糊的（fuzzy），因为它们不能反映出在任意给点的时间点数据树的准确状态。

一个数据树中只有2个znode节点：/z和/z'。一开始，两个znode节点的数据都是1。现在有以下操作步骤：

1. 开始一个快照。
2. 序列化并将/z=1到到快照。
3. 使/z的数据为2（事务T）。
4. 使/z'的数据为2（事务T'）。
5. 序列化并将/z'=2写入到快照。

这个快照包含了/z=1和/z'=2。

服务器会重播（replay）事务。
每一个快照文件都会以快照_开始时最后一个被提交的事务T_作为标记（tag），将这个时间戳记为TS。
如果服务器最后加载快照，它会重播在TS之后的所有事务日志中的事务。在快照的基础上重放后，服务器最终得到一个合理的状态。

一个重要的问题，就是再次执行事务T'是否会有问题，因为这个事务在开始快照开始之后已经被接受，而结果也被快照中保存下来。
事务是幂等的（idempotent），所以即使按照相同的顺序再次执行相同的事务，也会得到相同的结果，即便其结果已经保存到快照中。

一个操作设置某个znode节点的数据为一个特定的值，这个值并不依赖于任何其他东西，无条件（unconditionly）地设置/z'的值（setData请求中的版本号为－1），重新执行操作成功，
但因为递增了两次，所以最后以错误的版本号结束。如以下方式就会导致问题出现，假设有如下3个操作并成功执行：

```text
setData /z', 2, -1
setData /z', 3, 2
setData /a, 0, -1
```

第一个setData操作跟之前描述的一样，而后又加上了2个setData操作，以此来展示在重放中第二个操作因为错误的版本号而未能成功的情况。
假设这3个操作在提交时被正确执行。此时如果服务器加载最新的快照，即该快照已包含第一个setData操作。服务器仍然会重放第一个setData操作，因为快照被一个更早的zxid所标记。
因为重新执行了第一个setData操作。而第二个setData操作的版本号又与期望不符，那么这个操作将无法完成。而第三个setData操作可以正常完成，因为它也是无条件的。

在加载完快照并重放日志后，此时服务器的状态是不正确的，因为它没有包括第二个setData请求。这个操作违反了持久性和正确性，以及请求的序列应该是无缺口（no gap）的属性。

重放请求的问题可以通过把事务转换为群首服务器所生成的state delta来解决。
当群首服务器为一个请求产生事务时，作为事务生成的一部分，包括了一些在这个请求中znode节点或它的数据变化的值（delta值），并指定一个特定的版本号。
最后重新执行一个事务就不会导致不一致的版本号。

### 服务器与会话

会话（Session）是Zookeeper的一个重要的抽象。保证请求有序、临时znode节点、监事点都与会话密切相关。因此会话的跟踪机制对ZooKeeper来说也非常重要。

ZooKeeper服务器的一个重要任务就是跟踪并维护这些会话。在独立模式下，单个服务器会跟踪所有的会话，而在仲裁模式下则由群首服务器来跟踪和维护。
群首服务器和独立模式的服务器实际上运行相同的会话跟踪器（参考SessionTracker类和SessionTrackerImpl类）。
而追随者服务器仅仅是简单地把客户端连接的会话信息转发给群首服务器（参考LearnerSessionTracker类）。

为了保证会话的存活，服务器需要接收会话的心跳信息。心跳的形式可以是一个新的请求或者显式的ping消息（参考LearnerHandler.run()）。
两种情况下，服务器通过更新会话的过期时间来触发（touch）会话活跃（参考SessionTrackerImpl.touchSession()方法）。
在仲裁模式下，群首服务器发送一个PING消息给它的追随者们，追随者们返回自从最新一次PING消息之后的一个session列表。
群首服务器每半个tick就会发送一个ping消息给追随者们。所以，如果一个tick被设置成2秒，那么群首服务器就会每一秒发送一个ping消息。

对于管理会话的过期有两个重要的要点：

一个称为过期队列（expiry queue）的数据结构（参考ExpiryQueue类），用于维护会话的过期。
这个数据结构使用bucket来维护会话，每一个bucket对应一个某时间范围内过期的会话，群首服务器每次会让一个bucket的会话过期。
为了确定哪一个bucket的会话过期，如果有的话，当下一个底限到来时，一个线程会检查这个expiry queue来找出要过期的bucket。
这个线程在底限时间到来之前处于睡眠状态，当它被唤醒时，它会取出过期队列的一批session，让它们过期。当然取出的这批数据也可能是空的。

为了维护这些bucket，群首服务器把时间分成一些片段，以expirationInterval为单位进行分割，并把每个会话分配到它的过期时间对应的bucket里，
其功能就是有效地计算出一个会话的过期时间，以向上取正的方式获得具体时间间隔。

更具体来说，就是对下面的表达式进行计算，当会话的过期时间更新时，根据结果来决定它属于哪一个bucket：

```text
(expirationTime / expirationInterval + 1) * expirationInterval
```

比如expirationInterval为2，会话的超时时间为10。那么这个会话分配到bucket为12（（10/2+1）*2的结果）。

注意当触发（touch）这个会话时expirationTime会增加，所以随后需要根据之后的计算会话移动到其他的bucket中。

使用bucket的模式来管理的一个主要原因是为了减少让会话过期这项工作的系统开销。
在一个ZooKeeper的部署环境中，可能其客户端就有数千个，因此也就有数千个会话。在这种场景下要细粒度地检查会话过期是不合适的。
如果expirationInterval短的话，那么ZooKeeper就会以这种细粒度的方式完成检查。目前expirationInterval是一个tick，通常以秒为单位。

### 服务器与监视点

监视点是由读取操作所设置的一次性触发器，每个监视点由一个特定操作来触发。为了在服务端管理监视点，ZooKeeper的服务端实现了监视点管理器（watch manager）。
一个WatchManager类的实例负责管理当前已被注册的监视点列表，并负责触发它们。
所有类型的服务器（包括独立服务器，群首服务器，追随者服务器和观察者服务器）都使用同样的方式处理监视点。

DataTree类中持有一个监视点管理器来负责子节点监控和数据的监控，对于这两类监控，当处理一个设置监视点的读请求时，该类就会把这个监视点加入manager的监视点列表。
类似的，当处理一个事务时，该类也会查找是否需要触发相应的监视点。如果发现有监视点需要触发，该类就会调用manager的触发方法。
添加一个监视点和触发一个监视点都会以一个read请求或者FinalRequestProcessor类的一个事务开始。

在服务端触发了一个监视点，最终会传播到客户端。负责处理传播的为服务端的cnxn对象（参见ServerCnxn类），此对象表示客户端和服务端的连接并实现了Watcher接口。
Watch.process方法序列化了监视点事件为一定格式，以便用于网络传送。ZooKeeper客户端接收序列化的监视点事件，并将其反序列化为监视点事件的对象，并传递给应用程序。

监视点只会保存在内存，而不会持久化到硬盘。当客户端与服务端的连接断开时，它的所有监视点会从内存中清除。
因为客户端库也会维护一份监视点的数据，在重连之后监视点数据会再次被同步到服务端。

### 客户端

在客户端库中有2个主要的类：ZooKeeper和ClientCnxn。

ZooKeeper类实现了大部分API，写客户端应用程序时必须实例化这个类来建立一个会话。
一旦建立起一个会话，ZooKeeper就会使用一个会话标识符来关联这个会话。这个会话标识符实际上是由服务端所生成的（参考SessionTrackerImpl类）。

ClientCnxn类管理连接到server的Socket连接。
该类维护了一个可连接的ZooKeeper的服务器列表，并当连接断掉的时候无缝地切换到其他的服务器。
当重连到一个其他的服务器时会使用同一个会话（如果没有过期的话），客户端也会重置所有的监视点到刚连接的服务器上（参考ClientCnxn.SendThread.primeConnection()）。
重置默认是开启的，可以通过设置disableAutoWatchReset来禁用。

### 序列化

对于网络传输和磁盘保存的序列化消息和事务，ZooKeeper使用了Hadoop中的Jute来做序列化。
如今，该库以独立包的方式被引入，在ZooKeeper代码库中，org.apache.jute就是Jute库
（ZooKeeper的开发团队早就讨论过要替换Jude，但至今没找到合适的方案，它工作得很好，还没有必要替换它）。

### 总结

群首竞选机制是可用性的关键因素，没有这个机制，ZooKeeper套件将无法保持可靠性。
拥有群首是必要但非充分条件，ZooKeeper还需要Zab协议来传播状态的更新等，即使某些服务器可能发生崩溃，也能保证状态的一致性。

了多种服务器类型：独立服务器、群首服务器、追随者服务器和观察者服务器。这些服务器之间因运转的机制及执行的协议的不同而不同。
在不同的部署场景中，各个服务器可以发挥不同的作用，比如增加观察者服务器可以提供更高的读吞吐量，而且还不会影响写吞吐量。
不过，增加观察者服务器并不会增加整个系统的高可用性。

在ZooKeeper内部，实现了一系列机制和数据结构。虽然提供了代码的相关线索，但并没有提供源代码的详尽视图。
强烈建议读者自行下载一份源代码，以本章所提供的线索为开端，独立分析和思考。

## 运行ZooKeeper

为了保证Zookeeper服务的功能正常，必须保证配置正确。
ZooKeeper作为分布式计算的基础建立在需要条件处理的情况下，所有的Zookeeper投票服务器必须拥有相同的配置，配置错误或不一致是运营过程中最主要的问题。

### 配置ZooKeeper服务器

ZooKeeper服务器在启动时从一个名为zoo.cfg的配置文件读取所有选项，多个服务器如果角色相似，同时基本配置信息一样，就可以共享一个文件。

data目录下的myid文件用于区分各个服务器，对每个服务器来说，data目录必须是唯一的，因此这个目录可以更加方便地保存一些差异化文件。
服务器ID将myid文件作为一个索引引入到配置文件中，一个特定的ZooKeeper服务器可以知道如何配置自己参数。
当然，如果服务器具有不同的配置参数（例如，事务日志保存在不同的地方），每个服务器就需要使用自己唯一的配置文件。

配置参数常常通过配置文件的方式进行设置，通过列表方式列出了这些参数。
很多参数也可以通过Java的系统属性传递，其形式通常为zookeeper.propertyName，在启动服务器时，通过-D选项设置这些属性。
不过，系统属性所对应的一个特定参数对服务来说是插入的配置，配置文件中的配置参数优先于系统属性中的配置。

#### 基本配置

某些配置参数并没有默认值，所以每个部署应用中必须配置：

* clientPort
	* 客户端所连接的服务器所监听的TCP端口，默认情况下，服务端会监听在所有的网络连接接口的这个端口上，除非设置了clientPortAddress参数。客户端端口可以设置为任何值，不同的服务器也可以监听在不同的端口上。默认端口号为2181。
* dataDir和dataLogDir
	* dataDir用于配置内存数据库保存的模糊快照的目录，如果某个服务器为集群中的一台，id文件也保存在该目录下。
	* dataDir并不需要配置到一个专用存储设备上，快照将会以后台线程的方式写入，且并不会锁定数据库，而且快照的写入方式并不是同步方式，直到写完整快照为止。
	* 事务日志对该目录所处的存储设备上的其他活动更加敏感，服务端会尝试进行顺序写入事务日志，因为服务端在确认一个事务前必须将数据同步到存储中，该设备的其他活动（尤其是快照的写入）可能导致同步时磁盘过于忙碌，从而影响写入的吞吐能力。因此，最佳实践是使用专用的日志存储设备，将dataLogDir的目录配置指向该设备。
* tickTime
	* tick的时长单位为毫秒，tick为ZooKeeper使用的基本的时间度量单位，该值还决定了会话超时的存储器大小。
	* Zookeeper集群中使用的超时时间单位通过tickTime指定，也就说，实际上tickTime设置了超时时间的下限值，因为最小的超时时间为一个tick时间，客户端最小会话超时时间为两个tick时间。
	* tickTime的默认值为3000毫秒，更低的tickTime值可以更快地发现超时问题，但也会导致更高的网络流量（心跳消息）和更高CPU使用率（会话存储器的处理）。

#### 存储配置

了一些更高级的配置参数，这些参数不仅适用于独立模式的服务，也适用于集群模式下的配置，这些参数不设置的话并不会影响ZooKeeper的功能，但有些参数（例如dataLogDir）最好还是配置：

* preAllocSize
	* 用于设置预分配的事务日志文件（zookeeper.preAllocSize）的大小值，以KB为单位。
	* 当写入事务日志文件时，服务端每次会分配preAllocSize值的KB的存储大小，通过这种方式可以分摊文件系统将磁盘分配存储空间和更新元数据的开销，更重要的是，该方式也减少了文件寻址操作的次数。
	* 默认情况下preAllocSize的值为64MB，缩小该值的一个原因是事务日志永远不会达到这么大，因为每次快照后都会重新启动一个新的事务日志，如果每次快照之间的日志数量很小，而且每个事务本身也很小，64MB的默认值显然就太大了。
		* 例如，如果每1000个事务进行一次快照，每个事务的平均大小为100字节，那么100KB的preAllocSize值则更加合适。
		* 默认的preAllocSize值的设置适用于默认的snapCount值和平均事务超过512字节的情况。
* snapCount
	* 指定每次快照之间的事务数（zookeeper.snapCount）。
	* 当Zookeeper服务器重启后需要恢复其状态，恢复时两大时间因素分别是为恢复状态而读取快照的时间以及快照启动后所发生的事务的执行时间。执行快照可以减少读入快照文件后需要应用的事务数量，但是进行快照时也会影响服务器性能，即便是通过后台线程的方式进行写入操作。
	* snapCount的默认值为100000，因为进行快照时会影响性能，所以集群中所有服务器最好不要在同一时间进行快照操作，只要仲裁服务器不会一同进行快照，处理时间就不会受影响，因此每次快照中实际的事务数为一个接近snapCount值的随机数。
	* _注意，如果snapCount数已经达到，但前一个快照正在进行中，新的快照将不会开始，服务器也将继续等到下一个snapCount数量的事务后再开启一个新的快照。_
* autopurge.snapRetainCount
	* 当进行清理数据操作时，需要保留在快照数量和对应的事务日志文件数量。
	* ZooKeeper将会定期对快照和事务日志进行垃圾回收操作，autopurge.snapRetainCount值指定了垃圾回收时需要保留的快照数，显然，并不是所有的快照都可以被删除，因为那样就不可能进行服务器的恢复操作。autopurge.snapRetainCount的最小值为3，也是默认值的大小。
* autopurge.purgeInterval
	* 对快照和日志进行垃圾回收（清理）操作的时间间隔的小时数。如果设置为一个非0的数字，autopurge.purgeInterval指定了垃圾回收周期的时间间隔，如果设置为0，默认情况下，垃圾回收不会自动执行，而需要通过ZooKeeper发行包中的zkCleanup.sh脚本手动运行。
* fsync.warningthresholdms
	* 触发警告的存储同步时间阀值（fsync.warningthresholdms），以毫秒为单位。
	* ZooKeeper服务器在应答变化消息前会同步变化情况到存储中。如果同步系统调用消耗了太长时间，系统性能就会受到严重影响，服务器会跟踪同步调用的持续时间，如果超过fsync.warningthresholdms只就会产生一个警告消息。默认情况下，该值为1000毫秒。
* weight.x=n
	* 该选项常常以一组参数进行配置，该选项指定组成一个仲裁机构的某个服务器的权重为n，其权重n值指示了该服务器在进行投票时的权重值。在ZooKeeper中一些部件需要投票值，比如群首选举中和原子广播协议中。默认情况下，一个服务器的权重值为1，如果定义的一组服务器没有指定权重，所有服务器的权重值将默认分配为1。
* traceFile
	* 持续跟踪ZooKeeper的操作，并将操作记录到跟踪日志中，跟踪日志的文件名为traceFile.year.month.day。除非设置了该选项（requestTraceFile），否则跟踪功能将不会启用。
	* 该选项用来提供ZooKeeper所进行的操作的详细视图。不过，要想记录这些日志，ZooKeeper服务器必须序列化操作，并将操作写入磁盘，这将争用CPU和磁盘的时间。如果你使用了该选项，请确保不要将跟踪文件放到日志文件的存储设备中。还需要知道，跟踪选项还可能影响系统运行，甚至可能会很难重现跟踪选项关闭时发生的问题。另外还有个有趣的问题，traceFile选项的Java系统属性配置中不含有zookeeper前缀，而且系统属性的名称也与配置选项名称不同，这一点请小心。

#### 网络配置

配置参数可以限制服务器和客户端之间的通信，以及超时选项：

* globalOutstandingLimit
	* ZooKeeper中待处理请求的最大值（zookeeper.globalOutstandingLimit）。
	* ZooKeeper客户端提交请求比ZooKeeper服务端处理请求要快很多，服务端将会对接收到的请求队列化，最终（也许几秒之内）可能导致服务端的内存溢出。为了防止发生这个问题，ZooKeeper服务端中如果待处理请求达到globalOutstandingLimit值就会限制客户端的请求。
	* 但是globalOutstandingLimit值并不是硬限制，因为每个客户端至少有一个待处理请求，否则会导致客户端超时，因此，当达到globalOutstandingLimit值后，服务端还会继续接收客户端连接中的请求，条件是这个客户端在服务器中没有任何待处理的请求。
	* 为了确定某个服务器的全局限制值，只是简单地将该参数值除以服务器的数量，目前还没有更智能的方式去实现全局待处理操作数量的计算，并强制采用该参数所指定的限制值，因此，该限制值为待处理请求的上限值，事实上，服务器之间完美的负载均衡解决方案还无法实现，所以某些服务器运行得稍缓慢一点，或者处于更高的负载中，即使最终没有达到全局限制值也可能被限制住吞吐量。
	* 该参数的默认值为1000个请求，你可能并不会修改该参数值，但如果你有很多客户端发送大数据包请求可能就需要降低这个参数值，但在实践中还未遇到需要修改这个参数的情况。
* maxClientCnxns
	* 允许每个IP地址的并发socket连接的最大数量。Zookeeper通过流量控制和限制值来避免过载情况的发生。一个连接的建立所使用的资源远远高于正常操作请求所使用的资源。曾看到过某些错误的客户端每秒创建很多ZooKeeper连接，最后导致拒绝服务（DoS），为了解决这个问题，添加了这个选项，通过设置该值，可以在某个IP地址已经有maxClientCnxns个连接时拒绝该IP地址新的连接。该选项的默认值为60个并发连接。
	* 注意，每个服务器维护着这个连接的数量，如果有一个5个服务器的集群，并且使用默认的并发连接数60，一个欺诈性的客户端会随机连接到这5个不同的服务器，正常情况下，该客户端几乎可以从单个IP地址上建立300个连接，之后才会触发某个服务器的限制。
* clientPortAddress
	* 限制客户端连接到指定的接收信息的地址上。默认情况下，一个ZooKeeper服务器会监听在所有的网络接口地址上等待客户端的连接。
	* 有些服务器配置了多个网络接口，其中一个网络接口用于内网通信，另一个网络接口用于公网通信，如果你并不希望服务器在公网接口接受客户端的连接，只需要设置clientPortAddress选项为内网接口的地址。
* minSessionTimeout
	* 最小会话超时时间，单位为毫秒。当客户端建立一个连接后就会请求一个明确的超时值，而客户端实际获得的超时值不会低于minSessionTimeout的值。
	* ZooKeeper开发人员很想立刻且准确地检测出客户端故障发生的情况，遗憾的是，系统不可能实时处理这种情况，而是通过心跳和超时来处理。超时取决于ZooKeeper客户端与服务器之间的响应能力，更重要的是两者之间的网络延时和可靠性。超时时间允许的最小值为客户端与服务器之间网络的环回时间，但偶尔还是可能发生丢包现象，当这种情况发生时，因为重传超时导致接收响应时间的增加，并会导致接收重发包的延时。
	* minSessionTimeout的默认值为tickTime值的两倍。配置该参数值过低可能会导致错误的客户端故障检测，配置该参数值过高会延迟客户端故障的检测时间。
* maxSessionTimeout
	* 会话的最大超时时间值，单位为毫秒。当客户端建立一个连接后就会请求一个明确的超时值，而客户端实际获得的超时值不会高于maxSessionTimeout的值。
	* 虽然该参数并不会影响系统的性能，但却可以限制一个客户端消耗系统资源的时间，默认情况下maxSessionTimeout的时间为tickTime的20倍。

#### 集群配置

当以一个集群来构建ZooKeeper服务时，需要为每台服务器配置正确的时间和服务器列表信息，以便服务器之间可以互相建立连接并进行故障监测，在ZooKeeper的集群中，这些参数的配置必须一致：

* initLimit
	* 对于追随者最初连接到群首时的超时值，单位为tick值的倍数。
	* 当某个追随者最初与群首建立连接时，它们之间会传输相当多的数据，尤其是追随者落后整体很多时。配置initLimit参数值取决于群首与追随者之间的网络传输速度情况，以及传输的数据量大小，如果ZooKeeper中保存的数据量特别大（即存在大量的znode节点或大数据集）或者网络非常缓慢，就需要增大initLimit值，因为该值取决于环境问题，所有没有默认值。你需要为该参数配置适当的值，以便可以传输所期望的最大快照，也许有时你需要多次传输，你可以配置initLimit值为两倍你所期望的值。如果配置initLimit值过高，那么首次连接到故障的服务器就会消耗更多的时间，同时还会消耗更多的恢复时间，因此最好在你的网络中进行追随者与群首之间的网络基准测试，以你规划所使用的数据量来测试出你所期望的时间。
* syncLimit
	* 对于追随者与群首进行sync操作时的超时值，单位为tick值的倍数。
	* 追随者总是会稍稍落后于群首，但是如果因为服务器负载或网络问题，就会导致追随者落后群首太多，甚至需要放弃该追随者，如果群首与追随者无法进行sync操作，而且超过了syncLimit的tick时间，就会放弃该追随者。与initLimit参数类似，syncLimit也没有默认值，与initLimit不同的是，syncLimit并不依赖于ZooKeeper中保存的数据量大小，而是依赖于网络的延迟和吞吐量。在高延迟网络环境中，发送数据和接收响应包会耗费更多时间，此时就需要调高syncLimit值。即使在相对低延迟的网络中，如果某些相对较大的事务传输给追随者需要一定的时间，你也需要提高syncLimit值。
* leaderServes
	* 配置值为“yes”或“no”标志，指示群首服务器是否为客户端提供服务（zookeeper.leaderServes）。
	* 担任群首的ZooKeeper服务器需要做很多工作，它需要与所有追随者进行通信并会执行所有的变更操作，也就意味着群首的负载会比追随者的负载高，如果群首过载，整个系统可能都会受到影响。
	* 该标志位如果设置为“no”就可以使群首除去服务客户端连接的负担，使群首将所有资源用于处理追随者发送给它的变更操作请求，这样可以提高系统状态变更操作的吞吐能力。换句话说，如果群首不处理任何与其直连的客户端连接，追随者就会有更多的客户端，因为连接到群首的客户端将会分散到追随者上，尤其注意在集群中服务器数量比较少的时候。默认情况下，leaderServes的值为“yes”。
* server.x=[hostname]:n:n[:observer]
	* 服务器x的配置参数。
	* ZooKeeper服务器需要知道它们如何通信，配置文件中该形式的配置项就指定了服务器x的配置信息，其中x为服务器的ID值（一个整数）。当一个服务器启动后，就会读取data目录下myid文件中的值，之后服务器就会使用这个值作为查找server.x项，通过该项中的数据配置服务器自己。如果需要连接到另一个服务器y，就会使用server.y项的配置信息来与这个服务器进行通信。
	* 其中hostname为服务器在网络n中的名称，同时后面跟了两个TCP的端口号，第一个端口用于事务的发送，第二个端口用于群首选举，典型的端口号配置为2888：3888。如果最后一个字段标记了observer属性，服务器就会进入观察者模式。
	* 注意，所有的服务器使用相同的server.x配置信息，这一点非常重要，否则的话，因服务器之间可能无法正确建立连接而导致整个集群无法正常工作。
* cnxTimeout
	* 在群首选举打开一个新的连接的超时值（zookeeper.cnxTimeout）。
	* ZooKeeper服务器在进行群首选举时互相之间会建立连接，该选项值确定了一个服务器在进行重试前会等待连接成功建立的时间为多久。默认的超时时间为5秒，该值足够大，也许你并不需要修改。
* electionAlg
	* 选举算法的配置选项。
	* 为了整个配置的完整性，也列入了该选项。该选项用于选择不同的群首选举算法，但除了默认的配置外，其他算法都已经弃用了，所以你并不需要配置这个选项。

#### 认证和授权选项

zookeeper.DigestAuthenticationProvider.superDigest（只适用于Java系统属性）该系统属性指定了“super”用户的密码摘要信息（该功能默认不启用），以super用户认证的客户端会跳过所有ACL检查。该系统属性的值形式为super：encoded_digest。

为了生成加密的摘要，可以使用org.apache.zookeeper.server.auth.DigestAuthenticationProvider工具，使用方式如下：

```shell
java -cp $ZK_CLASSPATH org.apache.zookeeper.server.auth.DigestAuthenticationProvider super:asdf
```

通过命令行工具生成了一个asdf这个密码的加密摘要信息：

```text
super:asdf->super:T+4Qoey4ZZ8Fnni1Yl2GZtbH2W4=
```


为了在服务器启动中使用该摘要，可以通过以下命令实现：

```shell
export SERVER_JVMFLAGS
SERVER_JVMFLAGS=-Dzookeeper.DigestAuthenticationProvider.superDigest=super:T+4Qoey4ZZ8Fnni1Yl2GZtbH2W4=
./bin/zkServer.sh start
```

现在，当通过zkCli进行连接时，可以通过以下方式：

```shell
[zk: localhost:2181(CONNECTED) 0] addauth digest super:asdf
[zk: localhost:2181(CONNECTED) 1]
```

此时，你已经以super用户的身份被认证，现在不会被任何ACL所限制。

**不安全连接**

> ZooKeeper客户端与服务器之间的连接并未加密，因此不要在不可信的链接中使用super的密码，使用super密码的安全方式是在ZooKeeper服务器本机上使用super密码运行客户端。

#### 非安全配置

这些配置选项只用于非常特殊情况。

* forceSync
	* 通过“yes”或“no”选项可以控制是否将数据信息同步到存储设备上（zookeeper.forceSync）。
	* 默认情况下，forceSync配置yes时，事务只有在同步到存储设备后才会被应答，同步系统调用的消耗很大，而且也是事务处理中最大的延迟原因之一。如果forceSync配置为no，事务会在写入到操作系统后就立刻被应答，在将事务写入磁盘之前，这些事务常常缓存于内存之中，配置forceSync为no可以提高性能，但代价是服务器崩溃或停电故障时可恢复性。
* jute.maxbuffer（仅适用于Java系统属性）
	* 一个请求或响应的最大值，以字节为单位。该选项只能通过Java的系统属性进行配置，并且选项名称没有zookeeper前缀。
	* ZooKeeper中内置了一些健康检查，其中之一就是对可传输的znode节点数据的大小的检查，ZooKeeper被设计用于保存配置数据，配置数据一般由少量的元数据信息（大约几百字节）所组成。默认情况下，一个请求或响应消息如果大于1M字节，就会被系统拒绝，你可以使用该属性来修改健康检查值，调小检查值，或者你真的确认要调大检查值。
* skipACL
	* 跳过所有ACL检查（zookeeper.skipACL）。
	* 处理ACL检查会有一定的开销，通过该选项可以关闭ACL检查功能，这样做可以提高性能，但也会将数据完全暴露给任何一个可以连接到服务器的客户端。
* readonlymode.enabled（仅适用于Java系统属性）
	* 将该配置设置为true可以启用服务器只读模式功能，客户端可以以只读模式的请求连接服务器并读取信息（可能是已过期的信息），即使该服务器在仲裁中因分区问题而被分隔。为了启用只读模式，客户端需要配置canBeReadOnly为true。
	* 该功能可以使客户端即使在网络分区发生时也能读取（不能写入）ZooKeeper的状态，在这种情况下，被分区而分离的客户端依然可以继续取得进展，并不需要等待分区问题被修复。特别注意，一个与集群中其他服务器失去连接ZooKeeper也许会终止以只读模式提供过期的数据服务。

**修改健康检查值**

> 虽然通过jute.maxbuffer指定的限制值可以进行大块数据的写入操作，但获取一个znode节点的子节点，而同时该节点有很多子节点时就会出现问题。
> 如果一个znode节点含有几十万个子节点，每个子节点的名字长度平均为10个字符，在试着返回子节点列表时就会命中默认最大缓冲大小检查，此时就会导致连接被重置。

#### 日志

ZooKeeper采用SLF4J库（JAVA简易日志门面）作为日志的抽象层，默认使用Log4J进行实际的日志记录功能。

日志记录功能会影响进程的性能，特别是开启了DEBUG级别时，与此同时，DEBUG级别提供了大量有价值的信息，可以帮诊断问题。
有一个方法可以平衡性能和开销问题，详细日志为你提供了更多细节信息，因此可以配置appender的日志级别为DEBUG，而rootLogger的级别为WARN，
当服务器运行时，如果你需要诊断某个问题，你可以通过JMX动态调整rootLogger的级别为INFO或DEBUG，更详细地检查系统的活动情况。

#### 专用资源

当你考虑在服务器上运行ZooKeeper如何配置时，服务器本身的配置也很重要。
为了达到你所期望的性能，可以考虑使用专用的日志存储设备，就是说日志目录处于专属的硬盘上，没有其他进程使用该硬盘资源，甚至周期性的模糊快照也不会使用该硬盘。

ZooKeeper是提供可靠性保证的关键组件，还应该部署ZooKeeper独立运行，防止资源竞争。

### 配置ZooKeeper集群

关于仲裁（quorum）的概念，该概念深深贯穿于ZooKeeper的设计之中。
在复制模式下处理请求时以及选举群首时都与仲裁的概念有关，如果ZooKeeper集群中存在法定人数的服务器已经启动，整个集群就可以继续工作。

与之相关的一个概念是观察者（observer）。
观察者与集群一同工作，接收客户端请求并处理服务器上的状态变更，但是群首并不会等待观察者处理请求的响应包，同时集群在进行群首选举时也不会考虑观察者的通知消息。

#### 多数原则

当集群中拥有足够的ZooKeeper服务器来处理请求时，称这组服务器的集合为仲裁法定人数，不希望有两组不相交的服务器集合同时处理请求，否则就会进入脑裂模式中。

可以避免脑裂问题，通过定义仲裁法定人数的数量至少为所有服务器中的多数。
（注意，集群服务器数量的一般并不会构成多数原则，至少需要大于所有服务器一半数量来构成多数原则）。

当配置多个服务器来组成ZooKeeper集群时，默认使用多数原则作为仲裁法定人数。
ZooKeeper会自动监测是否运行于复制模式，从配置文件读取时确定是否拥有多个服务器的配置信息，并默认使用多数原则的仲裁法定人数。

#### 法定人数的可配置性

关于法定人数的一个重要属性是，如果一个法定人数解散了，集群中另一个法定人数形成，这两个法定人数中至少有一个服务器必须交集。多数原则的法定人数无疑满足了这一交集的属性。
一般，法定人数并未限制必须满足多数原则，ZooKeeper也允许灵活的法定人数配置，这种特殊方案就是对服务器进行分组配置时，
会将服务器分组成不相交的集合并分配服务器的权重，通过这种方案来组成法定人数，需要使多数组中的服务器形成多数投票原则。

有三个组，每个组中有三个服务器，每个服务器的权重值为1，在这种情况下，需要四个服务器来组成法定人数：

某个组中的两个服务器，另一组中的两台服务器。

总之，其数学逻辑归结为：

如果有G个组，所需要的服务器为一个G'组的服务器，满足|G'|>|G|/2，同时对于G组中的服务器集合g，
还需要集合g’中的集合g满足集合g的所有权重值之和W'不小于集合g的权重值之和（如：W‘>W/2）。

一半以上的集合中，每个集合内部单个集合的条件也满足。

通过以下配置选项可以创建一个组：

* group.x=n[:n]
	* 启用法定人数的分层构建方式。x为组的标识符，等号后面的数字对应服务器的标识符，赋值操作符右侧为冒号分隔的服务器标识符的列表。
	* 注意，组与组之间不能存在交集，所有组的并集组成了整个ZooKeeper集群，换句话说，集群中的每个服务器必须在某个组中被列出一次。

9个服务器被分为3组的情况：

```text
group.1=1:2:3
group.2=4:5:6
group.3=7:8:9
```

每个服务器的权重都一样，为了构成法定人数，需要两个组及这两个组中各取两个服务器，也就是总共4个服务器。
但根据法定人数多数原则，至少需要5个服务器来构成一个法定人数。

注意，不能从任何子集形成法定人数的4个服务器，不过，一个组全部服务器加上另一个组的一个单独的服务器并不能构成法定人数。

当在跨多个数据中心部署ZooKeeper服务时，这种配置方式有很多优点。
例如，一个组可能表示运行于不同数据中心的一组服务器，即使这个数据中心崩溃，ZooKeeper服务也可以继续提供服务。

在每个数据中心中分配三个服务器，并且将这些服务器均放到同一组中：

```text
group.1=1:2:3:4:5:6
```

因为所有的服务器默认情况下权重值都一样，因此只要6个服务器中有4个服务器有效时就可以构成法定人数的服务器。
当然，这也意味着如果某个数据中心失效，就不能形成法定人数，即使另一个数据中心的三个服务器均有效。

为了给服务器分配不同的权重值，可以通过以下选型进行配置：

* weight.x=n
	* 与group选项一起配合使用，通过该选项可以为某个服务器形成法定人数时分配一个权重值为n。
	* 其值n为服务器投票时的权重，ZooKeeper中群首选举和原子广播协议中均需要投票。默认情况下，服务器的权重值为1，如果配置文件中定义了组的选项，但未指定权重值，所有的服务器均会被分配权重值1。

某个数据中心只要其所有服务器均可用，即使在其他数据中心失效时，这个数据中心也可以提供服务，
暂且称该数据中心为D1，此时，可以为D1中的某个服务器分配更高权重值，以便可以更容易与其他服务器组成法定人数。

D1中有服务器1、2和3，通过以下方式为服务器1分配更高的权重值：

```text
weight.1=2
```

通过以上配置，就有了7个投票，在构成法定人数时，只需要4个投票。
如果没有weight.1=2参数，任何服务器都需要与其他三个服务器来构成法定人数，但有了这个参数配置，服务器1与两个服务器就可以构成法定人数。
因此，只要D1可用，即使其他数据中心发生故障，服务器1、2和3也能构成法定人数并继续提供服务。

#### 观察者

观察者（observer）为ZooKeeper服务器中不参与投票但保障状态更新顺序的特殊服务器。配置ZooKeeper集群使用观察者，需要在观察者服务器的配置文件中添加以下行：

```text
peerType=observer
```

同时，还需要在所有服务器的配置文件中添加该服务器的：observer定义。

```text
server.1:localhost:2181:3181:observer
```

### 重配置

含有3个服务器的集群将要扩展到5个：

![含有3个服务器的集群将要扩展到5个](/static/img/2018-08-06-ZooKeeper/2018-08-15-23-31-14.png)

将所有服务停止，添加服务器D和E到集群中。如果服务器A和B的启动慢一些，比如服务器A和B比其他三个服务器的启动晚一些。

5个服务器的集群的法定人数为3：

![5个服务器的集群的法定人数为3](/static/img/2018-08-06-ZooKeeper/2018-08-15-23-32-24.png)

5个服务器的集群丢失数据：

![5个服务器的集群丢失数据](/static/img/2018-08-06-ZooKeeper/2018-08-15-23-32-47.png)

为了避免这个问题，ZooKeeper提供了重配置操作，这意味着运维人员并不需要手工进行重配置操作而导致状态信息的破坏，而且，也不需要停止任何
服务。重配置不仅可以让改变集群成员配置，还可以修改网络参数配置，因为ZooKeeper中配置信息的变化，需要将重配置参数与静态的配置文件分离，单独保存为一个配置文件并自动更新该
文件。
配额管理的跟踪功能通过/zookeeper子树完成，所以应用程序不能在这个子树中存储自己的数据，这个子树只应该保留给ZooKeeper使
用，而/zookeeper/quota节点就是ZooKeeper管理配额的节点。为了对应
用程序/application/superApp创建一个配额项，需要
在/application/superApp节点下创建两个子节点zookeeper_limits和
zookeeper_stats。dynamicConfigFile参数和链接这两个配置文件。

配额管理的跟踪功能通过/zookeeper子树完成，所以应用程序不能在这个子树中存储自己的数据，这个子树只应该保留给ZooKeeper使
用，而/zookeeper/quota节点就是ZooKeeper管理配额的节点。为了对应
用程序/application/superApp创建一个配额项，需要
在/application/superApp节点下创建两个子节点zookeeper_limits和
zookeeper_stats。
**我是否可以使用动态配置选项？**

> 该功能已经在Apache仓库的主干分支中被添加，主干的目标版本号为3.5.0（书时未发布版本）。

```conf
# 普通配置
tickTime=2000
initLimit=10
syncLimit=5
dataDir=./data
dataLogDir=./txnlog
clientPort=2182
server.1=127.0.0.1:2222:2223
server.2=127.0.0.1:3333:3334
server.3=127.0.0.1:4444:4445
```

```conf
# dynamic
tickTime=2000initLimit=10
syncLimit=5
dataDir=./data
dataLogDir=./txnlog
dynamicConfigFile=./dyn.cfg
```

```conf
# dyn.cfg
# server.id=host:n:n[:role];[client_address:]client_port
# role选项必须为participant或observe，默认为participant
server.1=127.0.0.1:2222:2223:participant;2181
server.2=127.0.0.1:3333:3334:participant;2182
server.3=127.0.0.1:4444:4445:participant;2183
```

使用重配置之前必须先创建这些文件，一旦这些文件就绪，就可以通过reconfig操作来重新配置一个集群，该操作可以增量或全量（整体）地进行更新操作。

增量的重配置操作将会形成两个列表：

待删除的服务器列表，待添加的服务器项的列表。

待删除的服务器列表仅仅是一个逗号分隔服务器ID列表，待添加的服务器项列表为逗号分隔的服务器项列表，每个服务器项的形式为动态配置文件中所定义的形式。

```shell
reconfig -remove 2,3 -add \
  server.4=127.0.0.1:5555:5556:participant;2184,\
  server.5=127.0.0.1:6666:6667:participant;2185
```

该命令将会删除服务器2和3，添加服务器4和5。

该操作成功执行还需要满足某些条件：

* 首先，与其他ZooKeeper操作一样，原配置中法定人数必须处于活动状态；
* 其次，新的配置文件中构成的法定人数也必须处于活动状态。

_注意：不允许以独立模式运行重配置操作，只有在仲裁模式时才可以使用重配置功能。_

ZooKeeper一次允许一个配置的变更操作请求，当然，配置操作会非常快地被处理，而且重新配置也很少发生，所以并发的重配置操作应该不是什么问题。

还可以使用-file参数来指定一个新的成员配置文件来进行一次全量更新。

例如：reconfig -file newconf命令会产生如上面命令一样的增量操作结果，newconf文件为：

```conf
server.1=127.0.0.1:2222:2223:participant;2181
server.4=127.0.0.1:5555:5556:participant;2184
server.5=127.0.0.1:6666:6667:participant;2185
```

通过-members参数，后跟服务器项的列表信息，可以代替-file参数进行全量更新配置操作。

最后，所有形式的reconfig的为重新配置提供了条件，如果通过-v参数提供了配置版本号，reconfig命令会在执行前确认配置文件当前的版本号是否匹配，只有匹配才会成功执行。
可以通过读取/zookeeper/config节点来获取当前配置的版本号，或通过zkCli工具来调用config获取配置版本号信息。

**手动重配置**

如果你真想手动进行重配置操作（也许使用旧版本的ZooKeeper），最简单最安全的方式是，每次在停止整个服务器和启动ZooKeeper集群服务（即让群首建立起来）时只进行一个配置变更操作。

### 客户端连接串的管理

连接串。客户端连接串常常表示为逗号分隔的host：port对，其中host为主机名或IP地址，通过主机名可以提供服务器实际IP与所访问的服务器的标识符之间的间接层的对应关系。

不过，该灵活性有一定限制，运维人员可以改变组成集群的服务器机器，但不能改变客户端所使用的服务器。

集群从三个到五个服务器时，客户端的重配置：

![集群从三个到五个服务器时，客户端的重配置](/static/img/2018-08-06-ZooKeeper/2018-08-15-23-47-37.png)

另一种方式可以使ZooKeeper的服务器数量更具弹性，而不需要改变客户端的配置。
一个主机名可以解析为多个地址，如果主机名解析为多个IP地址，ZooKeeper就可以连接到其中的任何地址

集群从三个到五个服务器时，使用DNS对客户端的重配置：

![集群从三个到五个服务器时，使用DNS对客户端的重配置](/static/img/2018-08-06-ZooKeeper/2018-08-15-23-48-29.png)

在使用主机名解析为多个地址方式时，还有一些注意事项。

* 首先，所有的服务器必须使用相同的客户端端口号；
* 其次，主机名解析只有在创建连接时才会发生，所以已经连接的客户端无法知道最新的名称解析，只能对新创建的ZooKeeper客户端生效。

客户端的连接还可以包含路径信息，该路径指示了解析路径名称时的根路径。

如果客户端的连接串为zk：2222/app/superApp，当客户端连接并执行getData（"/a.dat"，...）操作时，实际客户端会得到/app/superApp/a.dat节点的数据信息。

_注意，连接串中指示的路径必须存在，而不会为你创建连接串中所指示的路径。_

在连接串中添加路径信息的动机在于一个ZooKeeper集群为多个应用程序提供服务，这样不需要要求每个应用程序添加其路径的前缀信息。
每个应用程序可以类似名称独享似的使用ZooKeeper集群，运维人员可以按他们的期望来划分命名空间。

通过连接串指定ZooKeeper客户端的根节点：

![通过连接串指定ZooKeeper客户端的根节点](/static/img/2018-08-06-ZooKeeper/2018-08-15-23-51-20.png)

**连接串的重叠**

> 当管理客户端连接串时，注意一个客户端的连接串永远不要包含两个不同的ZooKeeper集群的主机名，这是最快速也是最简单导致脑裂问题的方式。

### 配额管理

ZooKeeper的另一个可配置项为配额，ZooKeeper初步提供了znode节点数量和节点数据大小的配额管理的支持。
可以通过配置来指定某个子树的配额，该子树就会被跟踪，如果该子树超过了配额限制，就会记录一条警告日志，但操作请求还是可以继续执行。
此时，ZooKeeper会检测是否超过了某个配额限制，但不会阻止处理流程。

配额管理的跟踪功能通过/zookeeper子树完成，所以应用程序不能在这个子树中存储自己的数据，这个子树只应该保留给ZooKeeper使用，而/zookeeper/quota节点就是ZooKeeper管理配额的节点。

为了对应用程序/application/superApp创建一个配额项，需要在/application/superApp节点下创建两个子节点zookeeper_limits和zookeeper_stats。

对于znode节点数量的限制称之为count，而对于节点数据大小的限制则为bytes。  
在zookeeper_limits和zookeeper_stats节点中通过count=n，bytes=m来指定配额，其中n和m均为整数，  
在zookeeper_limits节点中，n和m表示将会触发警告的级别（如果配置为-1就不会触发警告信息），  
在zookeeper_stats节点中，n和m分别表示当前子树中的节点数量和子树节点的数据信息的当前大小。

**对元数据的配额跟踪**

> 对于子树节点数据的字节数配额跟踪功能，并不会包含每个znode节点的元数据的开销，元数据的大小大约100字节，
> 所以如果每个节点的数据大小都比较小，跟踪znode节点的数量比跟踪znode数据的大小更加实用。

```shell
[zk: localhost:2181(CONNECTED) 2] create /application ""Created /application
[zk: localhost:2181(CONNECTED) 3] create /application/superApp super
Created /application/superApp
[zk: localhost:2181(CONNECTED) 4] setquota -b 10 /application/superApp
Comment: the parts are option -b val 10 path /application/superApp
[zk: localhost:2181(CONNECTED) 5] listquota /application/superApp
absolute path is /zookeeper/quota/application/superApp/zookeeper_limits
Output quota for /application/superApp count=-1,bytes=10
Output stat for /application/superApp count=1,bytes=5
```

创建了/application/superApp节点，且该节点的数据为5个字节（一个单词“super”），
之后为/application/superApp节点设置了配额限制为10个字节，
当列出/application/superApp节点配置限制是，发现数据大小的配额还有5个字节的余量，而并未对这个子树设置znode节点数量的配额限制，因为配额中count的值为-1。

如果发送命令get/zookeeper/quota/application/superApp/zookeeper_stats，可以直接访问该节点数据，而不需要使用zkCli工具，
事实上，可以通过创建或删除这些节点来创建或删除配额配置。如果运行以下命令：

```shell
create /application/superApp/lotsOfData ThisIsALotOfData
```

就会在日志中看到如下信息：

```text
Quota exceeded: /application/superApp bytes=21 limit=10
```

### 多租赁配置

配额，提供了配置选项中的某些限制措施，而ACL策略更值得考虑如何使用ZooKeeper来服务于多租赁（multitenancy）情况。满足多租赁的一些令人信服的原因如下：

* 为了提供可靠的服务器，ZooKeeper服务器需要运行于专用的硬件设备之上，跨多个应用程序共享这些硬件设备更容易符合资本投资的期望。
* 发现，在大多数情况下，ZooKeeper的流量非常具有突发性：配置或状态的变化的突发操作会导致大量的负载，从而导致服务长时间的不可用。如果是没有什么关联的应用程序的突发操作，将这些应用程序共享这个服务器更能有效利用硬件资源。不过还是要注意失联事件发生时所产生的峰值，某些写得不太规范的应用程序在处理Disconnected事件时，产生的负载高于其所需要的资源。
* 对于硬件资源的分摊，可以获得更好的故障容错性：如果两个应用程序，从之前各自三个服务器的集群中转移到一个由5台服务器组成的集群，总量上所使用的服务器更少了，对ZooKeeper也可以容忍两台服务器的故障，而不是之前的只能容忍一个服务器故障。

当服务于多租赁的情况下时，运维人员一般会将数据树分割为不同的子树，每个子树为某个应用程序所专用。
开发人员在设计应用程序时可以考虑在其所用的znode节点前添加前缀，
但还有一个更简单的方法来隔离各个应用程序：在连接串中指定路径部分。  
每个应用程序的开发人员在进行应用程序的开发时，就像使用专用的ZooKeeper服务一样。
与此同时，运维人员还可以为应用节点配置配额限制，以便跟踪应用程序的空间使用情况。

### 文件系统布局和格式

快照文件将会被写入到DataDir参数所指定的目录中，而事务日志文件将会被写入到DataLogDir参数所指定的目录中。

#### 事务日志

```shell
-rw-r--r--  1 breed 67108880 Jun  5 22:12 log.100000001
-rw-r--r--  1 breed 67108880 Jul 15 21:37 log.200000001
```

这些文件非常大（每个都超过6MB）；
其次这些文件名的后缀中均有一个很大数字。

ZooKeeper为文件预分配大的数据块，来避免每次写入所带来的文件增长的元数据管理开销，如果你通过对这些文件进行十六进制转储打印，文件中全部以null字符（\0）填充，
只有在最开始部分有少量的二进制数据，服务器运行一段时间后，其中的null字符逐渐被日志数据替换。

日志文件中包含事务标签zxid，但为了减轻恢复负载，而且为了快速查找，每个日志文件的后缀为该日志文件中第一个zxid的十六进制形式。
通过十六进制表示zxid的一个好处就是你可以快速区分zxid中时间戳部分和计数器部分，所以在例子中的第一个文件的时间戳为1，而第二个文件的时间戳为2。

ZooKeeper丢失了某些znode节点信息，此时只有通过查找事务日志文件才可以知道客户端具体删除过哪些节点。

通过以下命令来查看第二个日志文件：

```shell
java -cp $ZK_LIBS org.apache.zookeeper.server.LogFormatter version-2 log.200000001
```

```java
7/15/13... session 0x13...00 cxid 0x0 zxid 0x200000001 createSession 30000
7/15/13... session 0x13...00 cxid 0x2 zxid 0x200000002 create
'/test,#22746573746 ...
7/15/13... session 0x13...00 cxid 0x3 zxid 0x200000003 create
'/test/c1,#6368696c ...
7/15/13... session 0x13...00 cxid 0x4 zxid 0x200000004 create
'/test/c2,#6368696c ...
7/15/13... session 0x13...00 cxid 0x5 zxid 0x200000005 create
'/test/c3,#6368696c ...
7/15/13... session 0x13...00 cxid 0x0 zxid 0x200000006 closeSession null
```

每个日志文件中的事务均以可读形式一行行地展示出来。因为只有变更操作才会被记录到事务日志，所以在事务日志中不会看到任何读事务操作。

#### 快照

```shell
-rw-r--r--  1 br33d  296 Jun  5 07:49 snapshot.0
-rw-r--r--  1 br33d  415 Jul 15 21:33 snapshot.100000009
```

快照文件并不会被预分配空间，所以文件大小也更加准确地反映了其中包含的数据大小。其中后缀表示快照开始时当时的zxid值，快照文件实际上为一个模糊快照，
直到事务日志重现之后才会成为一个有效的快照文件。因此在恢复系统时，必须从快照后缀的zxid开始重现事务日志文件，甚至更早的zxid开始重现事务。

快照文件中保存的模糊快照信息同样为二进制格式。

```shell
java -cp $ZK_LIBS org.apache.zookeeper.server.SnapshotFormatter version-2 snapshot.100000009
```

```shell
----
/
  cZxid = 0x00000000000000
  ctime = Wed Dec 31 16:00:00 PST 1969
  mZxid = 0x00000000000000
  mtime = Wed Dec 31 16:00:00 PST 1969
  pZxid = 0x00000100000002
  cversion = 1
  dataVersion = 0
  aclVersion = 0
  ephemeralOwner = 0x00000000000000
  dataLength = 0
 ----/sasd
  cZxid = 0x00000100000002
  ctime = Wed Jun 05 07:50:56 PDT 2013
  mZxid = 0x00000100000002
  mtime = Wed Jun 05 07:50:56 PDT 2013
  pZxid = 0x00000100000002
  cversion = 0
  dataVersion = 0
  aclVersion = 0
  ephemeralOwner = 0x00000000000000
  dataLength = 3
 ----
....
```

只有每个节点的元数据被转储打印出来，这样，运维人员就可以知道一个znode节点何时发生了变化，以及哪个znode节点占用了大量内存。
很遗憾，数据信息和ACL策略并没有出现在输出中，因此，在进行问题诊断时，记住将快照中的信息与日志文件的信息结合起来分析问题所在。

#### 时间戳文件

ZooKeeper的持久状态由两个小文件构成，它们是两个时间戳文件，其文件名为acceptedEpoch和currentEpoch。

这两个文件反映了某个服务器进程已接受的和正在处理的信息。
虽然这两个文件并不包含任何应用数据信息，但对于数据一致性却至关重要，所以备份一个ZooKeeper服务器的原始数据文件时，不要忘了这两个文件。

#### 已保存的ZooKeeper数据的使用

ZooKeeper数据存储的一个优点是，不管独立模式的服务器还是集群方式的服务器，数据的存储方式都一样。

将文件放到一个独立模式的服务器下空白的data目录下，然后启动服务，该服务就会真实反映出你所拷贝的那个服务器上的状态信息。
这项技术可以使你从生产环境拷贝服务器的状态信息，用于稍后的复查等用途。

同时也意味着，你只需要简单地将这些数据文件进行备份，就可以轻易地完成ZooKeeper服务器的备份，如果你采用这种方式进行备份，还需要注意一些问题。

首先，ZooKeeper为复制服务，所以系统中存在冗余信息，如果你进行备份操作，你只需要备份其中一台服务器的数据信息。

当ZooKeeper服务器认可了一个事务，从这时起它就会承诺记录下该状态信息，你一定要记住这一点，这一点非常重要。
因此如果你使用旧的备份文件恢复一个服务器，就会导致服务器违反其承诺。如果你刚刚遭遇了所有服务器的数据丢失的情况，这可能不是什么大问题，
但如果你的集群在正常工作中，而你将某个服务器还原为旧的状态，你的行为可能会导致其他服务器也丢失了某些信息。

如果你要对全部或大多数服务器进行数据丢失的恢复操作，最好的办法是使用你最新抓取的状态信息（从最新的存活服务器中获取的备份文件），并在启动服务器之前将状态信息拷贝到其他所有服务器上。

### 四字母命令

四字母命令的主要目标就是提供一个非常简单的协议，使我们使用简单的工具，如telnet或nc，就可以完成系统健康状况检查和问题的诊断。
为简单起见，四字母命令的输出也是可读形式，使得更容易使用这些命令。

* ruok
	* 提供（有限的）服务器的状态信息。如果服务器正在运行，就会返回imok响应信息。事实上“OK”状态只是一个相对的概念，例如，服务器运行中，虽无法与集群中其他服务器进行通信，然而该服务器返回的状态仍然是“OK”。对于更详细信息及可靠的健康状态检查，需要使用stat命令。
* stat
	* 提供了服务器的状态信息和当前活动的连接情况，状态信息包括一些基本的统计信息，还包括该服务器当前是否处于活动状态，即作为群首或追随者，该服务器所知的最后的zxid信息。某些统计信息为累计值，我们可以使用srst命令进行重置。
* srvr
	* 提供的信息与stat一样，只是忽略了连接情况的信息。
* dump
	* 提供会话信息，列出当前活动的会话信息以及这些会话的过期时间。该命令只能在群首服务器上运行。
* conf
	* 列出该服务器启动运行所使用的基本配置参数。
* envi
	* 列出各种各样的Java环境参数。
* mntr
	* 提供了比stat命令更加详细的服务器统计数据。每行输出的格式为`key<tab>value`。（群首服务器还将列出只用于群首的额外参数信息）。
* wchs
	* 列出该服务器所跟踪的监视点的简短摘要信息。
* wchc
	* 列出该服务器所跟踪的监视点的详细信息，根据会话进行分组。
* wchp
	* 列出该服务器所跟踪的监视点的详细信息，根据被设置监视点的znode节点路径进行分组。
* cons，crst
	* cons命令列出该服务器上每个连接的详细统计信息，crst重置这些连接信息中的计数器为0。

### 通过JMX进行监控

#### 远程连接

用于启动ZooKeeper服务器的zkServer.sh脚本中，使用SERVER_JVMFLAGS环境变量来配置这些系统属性。

```conf
SERVER_JVMFLAGS="-Dcom.sun.management.jmxremote.password.file=passwd \
  -Dcom.sun.management.jmxremote.port=55555 \
  -Dcom.sun.management.jmxremote.ssl=false \
  -Dcom.sun.management.jmxremote.access.file=access"

_path_to_zookeeper_/bin/zkServer.sh start _path_to_server3.cfg_
```

系统属性参数中用到了密码文件和访问控制文件，这些文件的格式非常简单。首先，创建passwd文件，方式如下：

```conf
# user password
admin <password>
```

_注意，密码文件中的密码信息为明文保存，因此只能给密码文件的所有者分配读写权限，如果不这样做，Java就无法启动服务。_

### 工具

一部分最受欢迎的软件或工具：

* 通过C绑定实现的Perl和Python语言的绑定库。
* ZooKeeper日志可视化的软件。
* 一个基于网页的集群节点浏览和ZooKeeper数据修改功能的软件。
* ZooKeeper中自带的zktreeutil和guano均可以从GitHub下载。这些软件可以对ZooKeeper的数据进行导入和导出操作。
* zktop，也可以从GitHub下载，该软件监控ZooKeeper的负载，并提供Unix的top命令类似的输出。
* ZooKeeper冒烟测试，可以从GitHub上下载。该软件对ZooKeeper集群提供了一个简单的冒烟测试客户端，这个工具对于开发人员熟悉ZooKeeper非常不错。

---

以上内容总结与《ZooKeeper分布式过程协同技术详解》